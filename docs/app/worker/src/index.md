# `app/worker/src/index.ts`

The single Worker (D-01): a Hono app for `/api/*`, `/webhooks/*`, and `/c/*`, plus the `queue` and `scheduled` handlers. Exports `app` for `app.request()` tests and the default `ExportedHandler`.

| Lines | What it does |
|-------|--------------|
| 1-9 | Hono, `HTTPException`, `requestId` middleware and its `RequestIdVariables` type, `secureHeaders`, the allowlisted logger, the `StaffCtx` type (owned by `middleware/staff-auth.ts`), the admin session route, the client-link route, and the config route. |
| 11-14 | `app` typed with `Bindings: Env` (from `worker-configuration.d.ts`) and the context variables `requestId`, optional `staff`, optional `errorCode`. |
| 16-17 | Every request gets a request id, then the logger (runs last on the way out, so it sees the final status). |
| 18 | `secureHeaders()` on `/api/*` (`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, …). |
| 19-24 | `/c/*`: `secureHeaders()` plus `Cache-Control: no-store` and `X-Robots-Tag: noindex`. Set **after** `next()` on `c.res`: Hono only materialises headers prepared before `next()` when the handler builds its response through `c.json`/`c.body`; a raw `Response` (the asset fallback) would drop them. |
| 26-36 | Error envelope `{ error: { code, message } }`. `HTTPException` → its status, `code` = its message (`'unauthorized'`, `'forbidden'`…); anything else → 500 `internal` / "Something went wrong". `errorCode` is stored for the logger; stack traces and messages of unknown errors are never serialised (T-01-10). |
| 38-40 | Mounts `GET /api/config`, `GET`/`POST /api/admin/session` (Plan 06; guarded by `staffAuth` inside the route), and `GET /c/:token` (Plan 07, `routes/client-link.ts`), which sits behind the `/c/*` headers middleware. |
| 42-52 | `notFound`: `/api/*` and `/webhooks/*` get 404 JSON `not_found` (never `index.html` with 200, T-01-12); every other path (e.g. `/c/`, which `/c/:token` does not match because the param cannot be empty) falls back to the SPA via `env.ASSETS.fetch`. The asset response is cloned (`new Response(res.body, res)`) because fetched responses have immutable headers and the `/c/*` middleware must add headers. The path is read for routing only. |
| 54-58 | Default export: `fetch` from Hono; `queue` (Phase 4) and `scheduled` (Phase 2) are empty bodies today — the handler shape is real, the work is not. |

## Notes

- Middleware order matters: `requestId` → `logger` → scoped `secureHeaders` → routes. The logger reads `routePath(c, -1)` after the chain completes.
- No `console.*` here; the logger owns the single `console.log` in `worker/src` (ESLint `no-console: error`).
- `/admin` never reaches this Worker: it is not in `run_worker_first`, so assets serve it directly.

## Tests

- `app/worker/test/auth.test.ts` covers the session route's 401/403/400 paths and the logged `error_code`.
- `app/worker/test/config.test.ts` (Task 2) drives `app.request()` with a mock `Env` for `/api/config`, the 404 envelope, and the `/c/` fallback headers.
