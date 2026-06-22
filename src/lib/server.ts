import type { APIContext } from 'astro';
import { createGitHubAdapter } from '../adapters/github-adapter';
import type { StorageAdapter } from '../adapters/types';

// locals.runtime.env から StorageAdapter を組み立てる。
// 案B移行時はここで createD1Adapter に差し替えるだけ。
export function getAdapter(locals: App.Locals): StorageAdapter {
  const env = locals.runtime.env;
  return createGitHubAdapter({
    GITHUB_TOKEN: env.GITHUB_TOKEN,
    GITHUB_OWNER: env.GITHUB_OWNER,
    GITHUB_REPO: env.GITHUB_REPO,
  });
}

export function getAdapterFromContext(context: APIContext): StorageAdapter {
  return getAdapter(context.locals);
}
