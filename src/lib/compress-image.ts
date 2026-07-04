// アップロード前にブラウザ内で画像を縮小する。iPhone の写真は 3〜10MB あり、モバイル回線でそのまま
// 上げると遅いため。EXIF orientation を反映してデコードするので縦撮り写真の向きズレも防げる。
// canvas 再描画により EXIF（位置情報含む）が落ちる副次効果があるが、公開ブログ用途ではむしろ望ましい。

const MAX_EDGE = 2048; // 長辺
const QUALITY = 0.85;

export async function compressImage(file: File): Promise<File> {
  // GIF（アニメ保持）と SVG は無変換で素通し
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  let bitmap: ImageBitmap;
  try {
    // EXIF orientation を反映してデコード（回転ズレ防止）
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file; // デコード不能（HEIC 等）→ 原本のまま送りサーバ判定に委ねる
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', QUALITY));
  if (!blob) return file; // 変換失敗（toBlob が null）→ 原本
  if (blob.size >= file.size) return file; // 縮小の意味がなければ原本
  return new File([blob], file.name.replace(/\.\w+$/, '.jpeg'), { type: 'image/jpeg' });
}
