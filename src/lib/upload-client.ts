import { compressImage } from './compress-image';

// 圧縮 + /api/upload POST の共通関数。heroImage（PostForm）と本文（BodyEditor）で共用する。
export async function uploadImage(file: File | Blob, type: string): Promise<string> {
  const f = file instanceof File ? file : new File([file], 'image', { type: file.type });
  const compressed = await compressImage(f);
  const fd = new FormData();
  fd.append('file', compressed);
  fd.append('type', type);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'アップロード失敗');
  return data.url as string;
}
