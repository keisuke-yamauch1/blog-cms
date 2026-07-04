import type { ContentType } from '../lib/content-types';
import type { PostMeta } from '../lib/schema';
import type { ListResult, StorageAdapter } from './types';

// ===== KV 一覧キャッシュ（GitHub のリードレプリカ） =====
// 真実は常に GitHub。KV は「最後に GitHub から組んだ一覧メタ」の写しにすぎない。
// 壊れたらキーを消せば次の list() で自動再構築される（自己修復）。
// github-adapter は触らず、このデコレータで外側から包む。
const REVALIDATE_MS = 60_000; // builtAt からこの時間を過ぎたら裏で再構築（SWR）

// キー: タイプごと1キー・v1 はスキーマ変更時にまるごと捨てるための接頭辞
export function listCacheKey(type: ContentType): string {
  return `list:v1:${type}`;
}

// KV に置く形。pubDate は JSON 化のため ISO 文字列で保存する。
// builtAt = GitHub から全件再構築した時刻（SWR の鮮度判定用。増分更新では触らない）。
interface CachedList {
  posts: Array<Omit<PostMeta, 'pubDate'> & { pubDate: string }>;
  total: number;
  builtAt: number;
}

function toMeta(post: { id: string; title: string; pubDate: Date; draft: boolean; format: 'md' | 'html' }): CachedList['posts'][number] {
  return {
    id: post.id,
    title: post.title,
    pubDate: post.pubDate.toISOString(),
    draft: post.draft,
    format: post.format,
  };
}

// KV の内部形 → 呼び出し側が期待する ListResult（pubDate を Date に戻す）
function deserialize(c: CachedList): ListResult {
  return {
    posts: c.posts.map((p) => ({ ...p, pubDate: new Date(p.pubDate) })),
    total: c.total,
  };
}

// ISO 8601 文字列は辞書順＝時系列順なので、そのまま降順ソートに使える
function sortDesc(posts: CachedList['posts']): void {
  posts.sort((a, b) => (a.pubDate < b.pubDate ? 1 : a.pubDate > b.pubDate ? -1 : 0));
}

export interface KvCacheDeps {
  kv: KVNamespace;
  // 裏側再構築を待たずにレスポンスを返すための Cloudflare ctx.waitUntil
  waitUntil: (p: Promise<unknown>) => void;
}

export function createKvCachedAdapter(inner: StorageAdapter, deps: KvCacheDeps): StorageAdapter {
  const { kv, waitUntil } = deps;

  // GitHub から全件のメタを組み直して KV に書く。返り値は組んだ結果。
  async function rebuild(type: ContentType): Promise<ListResult> {
    const result = await inner.list(type); // limit なし＝全件
    const cached: CachedList = {
      posts: result.posts.map(toMeta),
      total: result.total,
      builtAt: Date.now(),
    };
    await kv.put(listCacheKey(type), JSON.stringify(cached));
    return result;
  }

  return {
    async list(type: ContentType): Promise<ListResult> {
      const raw = (await kv.get(listCacheKey(type), 'json')) as CachedList | null;
      if (raw) {
        // builtAt が古ければ裏側で再構築（stale-while-revalidate）。今回は古い写しを即返す。
        if (Date.now() - raw.builtAt > REVALIDATE_MS) {
          waitUntil(rebuild(type).catch(() => {}));
        }
        return deserialize(raw);
      }
      // KV ミス（初回・キー削除後）→ GitHub 全件で再構築して返す
      return rebuild(type);
    },

    // 編集画面は正を読むべきなので get は GitHub 直読み（sha 楽観ロックに必要）
    get(type: ContentType, id: string) {
      return inner.get(type, id);
    },

    async save(type: ContentType, post) {
      await inner.save(type, post); // GitHub 保存が成功してから KV を増分更新
      try {
        const key = listCacheKey(type);
        const raw = (await kv.get(key, 'json')) as CachedList | null;
        if (!raw) return; // キャッシュ未構築なら何もしない（次の list() で全件構築される）
        const meta = toMeta(post);
        const idx = raw.posts.findIndex((p) => p.id === post.id);
        if (idx >= 0) {
          raw.posts[idx] = meta; // 更新
        } else {
          raw.posts.push(meta); // 新規
          raw.total += 1;
        }
        sortDesc(raw.posts);
        // builtAt は触らない（増分で上書きすると外部編集の取りこぼしが覆い隠される）
        await kv.put(key, JSON.stringify(raw));
      } catch {
        // 増分に失敗したらキーを消してフル再構築に倒す（GitHub 保存は成功済みで実害なし）
        await kv.delete(listCacheKey(type)).catch(() => {});
      }
    },

    async delete(type: ContentType, id: string) {
      await inner.delete(type, id); // GitHub 削除が成功してから KV を増分更新
      try {
        const key = listCacheKey(type);
        const raw = (await kv.get(key, 'json')) as CachedList | null;
        if (!raw) return;
        const before = raw.posts.length;
        raw.posts = raw.posts.filter((p) => p.id !== id);
        if (raw.posts.length !== before) raw.total -= 1;
        await kv.put(key, JSON.stringify(raw));
      } catch {
        await kv.delete(listCacheKey(type)).catch(() => {});
      }
    },
  };
}
