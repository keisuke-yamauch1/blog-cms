/// <reference path="../.astro/types.d.ts" />

// Cloudflare ランタイムに渡る環境変数（Secrets含む）
interface Env {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  ALLOWED_EMAILS?: string;
  DEV_BYPASS_AUTH?: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    // middleware が詰める認証済みユーザー
    user?: { email: string };
  }
}
