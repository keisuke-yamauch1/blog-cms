import type { APIRoute } from 'astro';
import { contentTypeList } from '../../lib/content-types';
import { listCacheKey } from '../../adapters/kv-cached-adapter';

export const prerender = false;

// 一覧キャッシュ（KV）の3タイプのキーを削除するだけ。
// 次の list() のミス時に GitHub から自動再構築される（外部 push を即取り込む保険）。
export const POST: APIRoute = async (context) => {
  // middleware 通過の再確認（設定不備・除外パス追加時の防御）
  if (!context.locals.user) return new Response('Unauthorized', { status: 401 });
  const kv = context.locals.runtime.env.CMS_CACHE;
  if (kv) {
    await Promise.all(contentTypeList().map((t) => kv.delete(listCacheKey(t))));
  }
  return context.redirect('/posts');
};
