# `app/worker/src/middleware/client-csp.ts`

Content-Security-Policy for the client portal (`/c/*`, D-16, T-04-16).

## `buildClientCsp(env)`

| Directive | Value | Why |
|-----------|-------|-----|
| `default-src` | `'self'` | deny by default |
| `script-src` | `'self' https://cdn.truv.com https://cdn.plaid.com` | Truv Bridge and Plaid Link scripts |
| `frame-src` | `https://my.truv.com https://cdn.plaid.com` | the Bridge and Link iframes |
| `connect-src` | `'self' https://*.truv.com https://*.plaid.com <Supabase origin> https://*.storage.supabase.co` | API calls, vendor telemetry, direct uploads to Storage |
| `img-src` | `'self' data: blob: https:` | previews and vendor logos |
| `style-src` | `'self' 'unsafe-inline'` | component inline styles |
| `font-src` | `'self' data:` | bundled fonts |
| `worker-src` | `'self' blob:` | PDF and image helpers |
| `base-uri` | `'self'` | no base-tag hijack |
| `form-action` | `'self'` | no form posts elsewhere |
| `frame-ancestors` | `'none'` | the portal cannot be framed |

The Supabase origin is `new URL(env.SUPABASE_URL).origin`.

## `clientCsp`

Mounted in `index.ts` as `app.use('/c/*', clientCsp)`, after `clientPrivacyHeaders`. It sets the header **after** `next()` so the SPA asset fallback and the Worker's invalid-link page both carry it. `/admin/*` and `/api/*` are untouched.

`shortcut:` requests whose host is `localhost` or `127.0.0.1` (any port) get no CSP, so Vite dev's inline refresh preamble runs. Every deployed host gets the header.

## Tests

`client-csp.test.ts` (directive string, localhost skip, deployed host, `/admin/` untouched) and the CSP check in `app/worker/test/payroll-start.test.ts`.
