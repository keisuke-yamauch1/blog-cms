import type { APIRoute } from 'astro';
import { isContentType } from '../../lib/content-types';

export const prerender = false;

// 対応形式（ヒアリング済み: jpeg/png/gif/webp の標準4種）
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const MAX_BYTES = 20 * 1024 * 1024; // 20MB（ヒアリング済み）

export const POST: APIRoute = async ({ request, locals }) => {
  const bucket = locals.runtime?.env?.IMAGES;
  if (!bucket) {
    // `npm run dev`(Vite) では R2 バインディングが無い。`wrangler pages dev` を使うこと。
    return json({ error: 'R2 バインディング(IMAGES)が無効です。wrangler pages dev で起動してください' }, 501);
  }

  const fd = await request.formData();
  const file = fd.get('file');
  const type = fd.get('type');
  if (!(file instanceof File)) return json({ error: 'file がありません' }, 400);
  if (!isContentType(type)) return json({ error: '不正なコンテンツタイプ' }, 400);
  const ext = ALLOWED[file.type];
  if (!ext) return json({ error: `未対応の形式: ${file.type}（jpeg/png/gif/webp のみ）` }, 400);
  if (file.size > MAX_BYTES) return json({ error: 'サイズ上限(20MB)超過' }, 400);

  // JST の YYYYMMDDhhmmss（r2-uploader と同じ命名）
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  // 同秒衝突は連番サフィックスで回避
  let key = `${type}/${stamp}.${ext}`;
  for (let i = 1; await bucket.head(key); i++) key = `${type}/${stamp}-${i}.${ext}`;

  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  return json({ url: `https://images.kechiiiiin.com/${key}` });
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
