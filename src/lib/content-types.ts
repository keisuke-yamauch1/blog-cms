// コンテンツタイプの定義（保存先・表示名の単一の真実）
// 新しいタイプを増やすときはここに1行足すだけ。

export const CONTENT_TYPES = {
  blog: { label: 'ブログ', dir: 'src/content/blog' },
  diary: { label: '日記', dir: 'src/content/diary' },
  emonicle: { label: 'emonicle', dir: 'src/content/emonicle' },
} as const;

export type ContentType = keyof typeof CONTENT_TYPES;

export function isContentType(value: unknown): value is ContentType {
  return typeof value === 'string' && value in CONTENT_TYPES;
}

export function contentTypeList(): ContentType[] {
  return Object.keys(CONTENT_TYPES) as ContentType[];
}

// type + id から astro-blog 内のファイルパスを決める
export function filePathFor(type: ContentType, id: string): string {
  return `${CONTENT_TYPES[type].dir}/${id}.md`;
}
