import { defineMiddleware } from 'astro:middleware';

// 認証は Cloudflare Access を前提にする。
// Access を通過したリクエストには以下のヘッダが付与される:
//   Cf-Access-Authenticated-User-Email … 認証済みメール
// blog-cms は Access の背後に置く前提で、ここではメールの allowlist だけ確認する。
// （厳密には Cf-Access-Jwt-Assertion の署名検証を足すとより堅牢。TODO）

export const onRequest = defineMiddleware(async (context, next) => {
  const { locals, request } = context;
  const env = locals.runtime?.env;

  // ローカル開発のバイパス（本番では DEV_BYPASS_AUTH を設定しないこと）
  if (env?.DEV_BYPASS_AUTH === 'true') {
    locals.user = { email: 'dev@localhost' };
    return next();
  }

  const email = request.headers.get('Cf-Access-Authenticated-User-Email')?.toLowerCase();
  const allowed = (env?.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!email || (allowed.length > 0 && !allowed.includes(email))) {
    // --- 一時診断（切り分け用。確認後に削除する）---
    const cfAccessHeaders: Record<string, string> = {};
    for (const [k, v] of request.headers) {
      if (k.toLowerCase().startsWith('cf-access')) {
        // JWT本体は長いので存在有無だけ
        cfAccessHeaders[k] = k.toLowerCase().includes('jwt') ? `present(len=${v.length})` : v;
      }
    }
    return new Response(
      JSON.stringify(
        {
          reason: !email ? 'email-header-missing' : 'email-not-in-allowlist',
          parsedEmail: email ?? null,
          allowedCount: allowed.length,
          allowedList: allowed,
          envPresent: Boolean(env),
          allowedEmailsRawSet: typeof env?.ALLOWED_EMAILS === 'string',
          cfAccessHeaders,
        },
        null,
        2,
      ),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
    // --- 一時診断ここまで ---
  }

  locals.user = { email };
  return next();
});
