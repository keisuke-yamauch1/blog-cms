import type { APIRoute } from 'astro';
import { getAdapterFromContext } from '../../lib/server';
import { isContentType } from '../../lib/content-types';

export const prerender = false;

// HTML フォームからの POST（application/x-www-form-urlencoded）を受ける
export const POST: APIRoute = async (context) => {
  try {
    const form = await context.request.formData();
    const type = form.get('type');
    const id = form.get('id');
    if (!isContentType(type) || typeof id !== 'string' || !id) {
      return new Response('不正なリクエスト', { status: 400 });
    }
    const adapter = getAdapterFromContext(context);
    await adapter.delete(type, id);
    return context.redirect('/posts');
  } catch (e: any) {
    return new Response(`削除失敗: ${e.message ?? e}`, { status: e.statusCode ?? 500 });
  }
};
