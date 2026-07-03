import type { ContentType } from '../lib/content-types';
import type { Post, PostMeta } from '../lib/schema';

// ===== 保存層の抽象（案C→案B 移行の心臓部） =====
// UI・APIルートはこのインターフェースにだけ依存する。
// 今は GitHubAdapter（Markdown を commit）。
// 将来 D1Adapter を1枚足してファクトリを差し替えれば案Bに移行できる。
// UI・認証・スキーマは無改修。

export interface ListResult {
  posts: PostMeta[]; // 表示するぶん（新しい順）
  total: number; // ディレクトリ内の総件数（limit で絞る前）
}

export interface StorageAdapter {
  // limit を渡すと本文取得を最近 limit 件に絞る（一覧の軽量化）。
  list(type: ContentType, opts?: { limit?: number }): Promise<ListResult>;
  get(type: ContentType, id: string): Promise<Post | null>;
  save(type: ContentType, post: Post): Promise<void>;
  delete(type: ContentType, id: string): Promise<void>;
}

// アダプタ生成に必要な環境（Cloudflare ランタイム env から渡す）
export interface AdapterEnv {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
}
