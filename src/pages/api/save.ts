import type { APIRoute } from 'astro';
import { getAdapterFromContext } from '../../lib/server';
import { isContentType } from '../../lib/content-types';
import { parseFrontmatter } from '../../lib/schema';
import type { Post } from '../../lib/schema';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  // middleware 通過の再確認（設定不備・除外パス追加時の防御）
  if (!context.locals.user) return json({ error: 'Unauthorized' }, 401);
  try {
    const { type, post: rawPost, isNew } = (await context.request.json()) as {
      type: unknown;
      post?: unknown;
      isNew?: boolean;
    };
    if (!isContentType(type)) return json({ error: '不正なコンテンツタイプ' }, 400);
    // 各フィールドの中身は parseFrontmatter（zod）が検証する。ここでは形だけ絞る。
    const post = (typeof rawPost === 'object' && rawPost !== null ? rawPost : {}) as Record<string, unknown>;
    if (!post.id || typeof post.id !== 'string') return json({ error: 'id（スラッグ）は必須です' }, 400);

    // Zod でメタ情報を検証
    const fm = parseFrontmatter(type, {
      title: post.title,
      description: post.description,
      tags: post.tags,
      pubDate: post.pubDate,
      draft: post.draft,
      heroImage: post.heroImage,
      format: post.format,
    });

    const full: Post = { ...fm, id: post.id, body: String(post.body ?? '') };
    const adapter = getAdapterFromContext(context);

    // 新規作成時は既存 id を上書きしない（要件G）
    if (isNew) {
      const existing = await adapter.get(type, full.id);
      if (existing) return json({ error: `id「${full.id}」は既に存在します` }, 409);
    }

    await adapter.save(type, full);
    return json({ ok: true, id: full.id });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'ZodError') {
      const issues = (e as { issues?: { message?: string }[] }).issues;
      return json({ error: issues?.[0]?.message ?? '入力エラー' }, 400);
    }
    const message = e instanceof Error ? e.message : String(e);
    const statusCode =
      typeof e === 'object' && e !== null && 'statusCode' in e
        ? ((e as { statusCode?: number }).statusCode ?? 500)
        : 500;
    return json({ error: message }, statusCode);
  }
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
