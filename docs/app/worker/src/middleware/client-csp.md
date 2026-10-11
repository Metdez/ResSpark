# `app/worker/src/middleware/client-csp.ts`

Content-Security-Policy for the client portal (`/c/*`, D-16, T-04-16; DocuSeal hosts added for D-15 in Plan 06-06).

## `buildClientCsp(env)`

| Directive | Value | Why |
|-----------|-------|-----|
| `default-src` | `'self'` | deny by default |
| `script-src` | `'self' https://cdn.truv.com https://cdn.plaid.com https://cdn.docuseal.com https://docuseal.com` | Truv Bridge and Plaid Link scripts; DocuSeal's `form.js` (cdn) and its lazy chunks (`docuseal.com/js/`) |
| `frame-src` | `https://my.truv.com https://cdn.plaid.com` | the Bridge and Link iframes. No DocuSeal host: its form is a custom element with an open shadow root, not an iframe (06-RESEARCH contradiction 3) |
| `connect-src` | `'self' https://*.truv.com https://*.plaid.com https://docuseal.com <Supabase origin> https://*.storage.supabase.co` | API calls, vendor telemetry, direct uploads to Storage; the DocuSeal embed fetches against the origin of its `src` (`/s/{slug}/…`, `/api/attachments`, signature uploads) |
| `img-src` | `'self' data: blob: https:` | previews and vendor logos |
| `style-src` | `'self' 'unsafe-inline'` | component inline styles |
| `font-src` | `'self' data: https://docuseal.com` | bundled fonts; DocuSeal's typed-signature font (`/fonts/DancingScript-Regular.otf`) |
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

## Why DocuSeal's hosts are on every `/c/*` document (Plan 06-06)

The client lands on `/c/` and moves to `/c/sign/<id>` by client-side navigation, which keeps the first document's policy. So the DocuSeal hosts must be in the policy of `/c/` itself, not only of a reload of `/c/sign/<id>`. `img-src https:` and `style-src 'unsafe-inline'` already cover the page images and the `customCss` style the embed injects. Only a deployed run can prove the list is complete (RESEARCH assumption A4: no `unsafe-eval`, no other host): the localhost skip means Playwright never sees the header, so the Plan 06-08 smoke check and the human device check watch for `securitypolicyviolation`.

Tests added: the parsed directives contain the two `script-src` hosts, `connect-src https://docuseal.com`, `font-src` exactly `'self' data: https://docuseal.com`, and an unchanged `frame-src`; a `/c/sign/<uuid>` URL carries the header. `worker/test/client-link.test.ts` also checks the header on the real app's SPA fallback for `/c/sign/<uuid>`.
