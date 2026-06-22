import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';

// blog-cms は管理画面（要認証・サーバ処理）なので SSR。
// デプロイ先は Cloudflare（Pages/Workers）。
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true }, // dev で .dev.vars を locals.runtime.env に流し込む
  }),
  integrations: [preact()],
});
