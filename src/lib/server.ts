import type { APIContext } from 'astro';
import { createGitHubAdapter } from '../adapters/github-adapter';
import { createKvCachedAdapter } from '../adapters/kv-cached-adapter';
import type { StorageAdapter } from '../adapters/types';

// locals.runtime.env から StorageAdapter を組み立てる。
// 案B移行時はここで createD1Adapter に差し替えるだけ。
export function getAdapter(locals: App.Locals): StorageAdapter {
  const env = locals.runtime.env;
  const github = createGitHubAdapter({
    GITHUB_TOKEN: env.GITHUB_TOKEN,
    GITHUB_OWNER: env.GITHUB_OWNER,
    GITHUB_REPO: env.GITHUB_REPO,
  });
  // KV バインディングがある時だけ一覧キャッシュ層を被せる（ローカル未設定でも動く）。
  if (!env.CMS_CACHE) return github;
  return createKvCachedAdapter(github, {
    kv: env.CMS_CACHE,
    waitUntil: (p) => locals.runtime.ctx.waitUntil(p),
  });
}

export function getAdapterFromContext(context: APIContext): StorageAdapter {
  return getAdapter(context.locals);
}
