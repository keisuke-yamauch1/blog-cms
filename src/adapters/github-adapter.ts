import { Octokit } from 'octokit';
import matter from 'gray-matter';
import { CONTENT_TYPES, filePathFor, type ContentType } from '../lib/content-types';
import type { Post, PostMeta } from '../lib/schema';
import type { AdapterEnv, ListResult, StorageAdapter } from './types';

// astro-blog リポジトリの Markdown を GitHub Contents API で読み書きする案C実装。
// 元 astro-blog の src/lib/github-client.ts を移植・整理したもの。

export class GitHubAPIError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'GitHubAPIError';
  }
}

// Workers ランタイムで安全な UTF-8 base64 変換（Buffer 非依存）
function encodeBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}
function decodeBase64(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

const BRANCH = 'main';

export function createGitHubAdapter(env: AdapterEnv): StorageAdapter {
  if (!env.GITHUB_TOKEN) throw new GitHubAPIError('GITHUB_TOKEN が未設定です');
  if (!env.GITHUB_OWNER || !env.GITHUB_REPO) {
    throw new GitHubAPIError('GITHUB_OWNER / GITHUB_REPO が未設定です');
  }
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;

  // ===== 一覧キャッシュ（Cloudflare Cache API） =====
  // 一覧は毎回 GitHub API を叩くと 1〜2 秒かかるため、短時間キャッシュして
  // 2回目以降を即応答にする。save/delete 時に該当タイプを bust する。
  const LIST_CACHE_TTL = 300; // 秒
  function listCacheKey(type: ContentType): Request {
    return new Request(`https://blog-cms.internal/list/${type}`);
  }
  function edgeCache(): Cache | null {
    return (globalThis as any).caches?.default ?? null;
  }
  async function readListCache(type: ContentType): Promise<ListResult | null> {
    const cache = edgeCache();
    if (!cache) return null;
    const hit = await cache.match(listCacheKey(type));
    if (!hit) return null;
    const data = (await hit.json()) as ListResult;
    // pubDate は JSON で文字列化されるので Date に戻す
    data.posts = data.posts.map((p) => ({ ...p, pubDate: new Date(p.pubDate as unknown as string) }));
    return data;
  }
  async function writeListCache(type: ContentType, result: ListResult): Promise<void> {
    const cache = edgeCache();
    if (!cache) return;
    const body = JSON.stringify(result);
    await cache.put(
      listCacheKey(type),
      new Response(body, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${LIST_CACHE_TTL}` },
      }),
    );
  }
  async function bustListCache(type: ContentType): Promise<void> {
    const cache = edgeCache();
    if (cache) await cache.delete(listCacheKey(type));
  }

  // 1ファイルの content + sha を取得（無ければ null）
  async function readFile(path: string): Promise<{ content: string; sha: string } | null> {
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref: BRANCH });
      if (!Array.isArray(data) && 'content' in data && data.type === 'file') {
        return { content: decodeBase64(data.content), sha: data.sha };
      }
      return null;
    } catch (error: any) {
      if (error.status === 404) return null;
      throw toError(error, `読み込み失敗: ${path}`);
    }
  }

  // gray-matter で Markdown ⇄ Post を相互変換
  function toPost(id: string, raw: string): Post {
    const { data, content } = matter(raw);
    return {
      id,
      title: String(data.title ?? ''),
      description: data.description,
      tags: Array.isArray(data.tags) ? data.tags : [],
      pubDate: data.pubDate ? new Date(data.pubDate) : new Date(),
      draft: Boolean(data.draft ?? false),
      heroImage: data.heroImage,
      format: data.format === 'html' ? 'html' : 'md',
      body: content.trimStart(),
    };
  }

  function toMarkdown(post: Post): string {
    const fm: Record<string, unknown> = {
      title: post.title,
      pubDate: post.pubDate instanceof Date ? post.pubDate.toISOString() : post.pubDate,
      draft: post.draft,
      tags: post.tags,
    };
    if (post.description) fm.description = post.description;
    if (post.heroImage) fm.heroImage = post.heroImage;
    // html は microCMS 移行分の印。md 記事の frontmatter は汚さない（既定 md は書かない）。
    if (post.format === 'html') fm.format = 'html';
    return matter.stringify(post.body ?? '', fm);
  }

  return {
    async list(type: ContentType, opts?: { limit?: number }): Promise<ListResult> {
      const dir = CONTENT_TYPES[type].dir;

      // キャッシュヒットなら即返す（GitHub 往復を省く）
      const cached = await readListCache(type);
      if (cached) return cached;

      // 1) ファイル名だけを軽量取得（本文を引かないので数KB）。
      //    REST の「ファイルごと getContent」は subrequest 上限に当たり、
      //    Tree で本文まで引くと全記事の本文（diary で約450KB）を毎回転送してしまう。
      const namesQuery = `
        query ($owner: String!, $repo: String!, $expr: String!) {
          repository(owner: $owner, name: $repo) {
            object(expression: $expr) {
              ... on Tree { entries { name type } }
            }
          }
        }`;
      let entries: any[];
      try {
        const res: any = await octokit.graphql(namesQuery, { owner, repo, expr: `${BRANCH}:${dir}` });
        entries = res?.repository?.object?.entries ?? null;
      } catch (error: any) {
        throw toError(error, `一覧取得失敗: ${dir}`);
      }
      if (!entries) return { posts: [], total: 0 }; // ディレクトリ未作成

      let names: string[] = entries
        .filter((e) => e.type === 'blob' && e.name.endsWith('.md'))
        .map((e) => e.name);
      const total = names.length;

      // ファイル名降順。diary はファイル名が日付(YYYY-MM-DD)なので日付降順＝最近順になる。
      // blog/emonicle はファイル名が contentId だが件数が少なく limit で切れないため順は問わない。
      names.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
      const picked = typeof opts?.limit === 'number' ? names.slice(0, opts.limit) : names;
      if (picked.length === 0) return { posts: [], total };

      // 2) 選んだファイルの本文だけをエイリアスで1リクエスト取得。
      const aliases = picked
        .map((name, i) => `f${i}: object(expression: "${BRANCH}:${dir}/${name}") { ... on Blob { text } }`)
        .join('\n');
      const contentQuery = `query ($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { ${aliases} } }`;
      let repoObj: Record<string, any>;
      try {
        const res: any = await octokit.graphql(contentQuery, { owner, repo });
        repoObj = res?.repository ?? {};
      } catch (error: any) {
        throw toError(error, `一覧本文取得失敗: ${dir}`);
      }

      const metas: PostMeta[] = picked
        .map((name, i): PostMeta | null => {
          const text = repoObj[`f${i}`]?.text;
          if (typeof text !== 'string') return null;
          const { data } = matter(text);
          return {
            id: name.replace(/\.md$/, ''),
            title: String(data.title ?? name),
            pubDate: data.pubDate ? new Date(data.pubDate) : new Date(0),
            draft: Boolean(data.draft ?? false),
            format: data.format === 'html' ? 'html' : 'md',
          };
        })
        .filter((m): m is PostMeta => m !== null);

      metas.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
      const result: ListResult = { posts: metas, total };
      await writeListCache(type, result);
      return result;
    },

    async get(type: ContentType, id: string): Promise<Post | null> {
      const file = await readFile(filePathFor(type, id));
      return file ? toPost(id, file.content) : null;
    },

    async save(type: ContentType, post: Post): Promise<void> {
      const path = filePathFor(type, post.id);
      const existing = await readFile(path);
      const content = encodeBase64(toMarkdown(post));
      const message = `${existing ? 'update' : 'create'}(${type}): ${post.title}`;
      try {
        await octokit.rest.repos.createOrUpdateFileContents({
          owner, repo, path, message, content, branch: BRANCH,
          ...(existing ? { sha: existing.sha } : {}),
        });
      } catch (error: any) {
        throw toError(error, `保存失敗: ${path}`);
      }
      await bustListCache(type); // 一覧キャッシュを無効化（自分の編集を即反映）
    },

    async delete(type: ContentType, id: string): Promise<void> {
      const path = filePathFor(type, id);
      const existing = await readFile(path);
      if (!existing) throw new GitHubAPIError('削除対象が見つかりません', 404);
      try {
        await octokit.rest.repos.deleteFile({
          owner, repo, path, message: `delete(${type}): ${id}`, sha: existing.sha, branch: BRANCH,
        });
      } catch (error: any) {
        throw toError(error, `削除失敗: ${path}`);
      }
      await bustListCache(type); // 一覧キャッシュを無効化
    },
  };
}

function toError(error: any, fallback: string): GitHubAPIError {
  if (error instanceof GitHubAPIError) return error;
  if (error.status === 401) return new GitHubAPIError('GitHub認証が無効です', 401);
  if (error.status === 409) return new GitHubAPIError('競合: 他で更新されています（再読み込みを）', 409);
  if (error.status === 403 && String(error.message).includes('rate limit')) {
    return new GitHubAPIError('GitHub APIのレート制限に達しました', 403);
  }
  return new GitHubAPIError(`${fallback}: ${error.message ?? error}`, error.status);
}
