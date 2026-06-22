import { z } from 'zod';
import type { ContentType } from './content-types';

// ===== スキーマ（単一の真実） =====
// ここで定義した frontmatter 項目が、フォーム入力検証・Markdown frontmatter・
// （将来の案B移行時は）D1 のカラム、すべての基準になる。
// astro-blog 側の content.config.ts もこの形に合わせる。

const baseSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です'),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  pubDate: z.coerce.date(),
  draft: z.boolean().default(false),
  heroImage: z.string().optional(), // R2 などにアップした画像URL
});

// タイプごとに差があれば extend する。今は共通。
export const SCHEMAS: Record<ContentType, z.ZodType> = {
  blog: baseSchema,
  diary: baseSchema,
  emonicle: baseSchema,
};

// frontmatter（メタ情報）部分の型
export type Frontmatter = z.infer<typeof baseSchema>;

// 入稿1件の完全な形（メタ + 本文 + 識別子）
export interface Post extends Frontmatter {
  id: string; // ファイル名（スラッグ）
  body: string; // Markdown 本文
}

// 一覧表示用の軽量メタ
export interface PostMeta {
  id: string;
  title: string;
  pubDate: Date;
  draft: boolean;
}

// 受け取った生データを検証して Frontmatter にする
export function parseFrontmatter(type: ContentType, data: unknown): Frontmatter {
  return SCHEMAS[type].parse(data) as Frontmatter;
}
