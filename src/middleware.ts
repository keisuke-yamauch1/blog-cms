import { defineMiddleware } from 'astro:middleware';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Cloudflare Access の JWT を公開鍵（JWKS）で署名検証する。
// Access はリクエストに Cf-Access-Jwt-Assertion ヘッダで JWT を付与する。
// （旧実装は Cf-Access-Authenticated-User-Email ヘッダを信用していたが、
//  Pages を Access 背後に置くとこのヘッダは付かず JWT のみ届く。かつ署名検証の方が堅牢。）
// 検証内容: 署名・iss・aud・有効期限（jose 既定）→ その上で email allowlist。

// JWKS はモジュールスコープでキャッシュ（jose が内部で cooldown 管理する）
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export const onRequest = defineMiddleware(async (context, next) => {
  const { locals, request } = context;
  const env = locals.runtime?.env;

  // ローカル開発のバイパス（本番では DEV_BYPASS_AUTH を設定しないこと）
  if (env?.DEV_BYPASS_AUTH === 'true') {
    locals.user = { email: 'dev@localhost' };
    return next();
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env?.CF_ACCESS_TEAM_DOMAIN || !env?.CF_ACCESS_AUD) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    jwks ??= createRemoteJWKSet(new URL(`${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.CF_ACCESS_TEAM_DOMAIN,
      audience: env.CF_ACCESS_AUD,
    });
    const email = String(payload.email ?? '').toLowerCase();

    const allowed = (env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean);
    if (!email || (allowed.length > 0 && !allowed.includes(email))) {
      return new Response('Forbidden', { status: 403 });
    }

    locals.user = { email };
    return next();
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }
});
