import { createMiddleware } from 'hono/factory'

// D-16: Truv Bridge and Plaid Link load on the client portal; nothing else third-party does.
export function buildClientCsp(env: Pick<Env, 'SUPABASE_URL'>): string {
  return [
    "default-src 'self'",
    "script-src 'self' https://cdn.truv.com https://cdn.plaid.com",
    'frame-src https://my.truv.com https://cdn.plaid.com',
    `connect-src 'self' https://*.truv.com https://*.plaid.com ${new URL(env.SUPABASE_URL).origin} https://*.storage.supabase.co`,
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

const LOCAL = /^(localhost|127\.0\.0\.1)(:\d+)?$/

// Set after next(), like clientPrivacyHeaders: a raw asset Response drops headers prepared before it.
// shortcut: no CSP on localhost so Vite dev's inline refresh preamble runs; production hosts always get it.
export const clientCsp = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  await next()
  if (LOCAL.test(new URL(c.req.url).host)) return
  c.res.headers.set('Content-Security-Policy', buildClientCsp(c.env))
})
