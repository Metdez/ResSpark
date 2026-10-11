# `app/worker/src/index.ts`

The single Worker (D-01): a Hono app for `/api/*`, `/webhooks/*`, and `/c/*`, plus the `queue` and `scheduled` handlers. Exports `app` for `app.request()` tests and the default `ExportedHandler`.

| Lines | What it does |
|-------|--------------|
| 1-6 | Hono, `HTTPException`, `requestId` middleware and its `RequestIdVariables` type, `secureHeaders`, the allowlisted logger, and the config route. |
| 8-9 | `StaffCtx` (`userId`, `firmId`, `role`) — the shape Plan 06's auth middleware sets; moved there later, shape kept. |
| 11-14 | `app` typed with `Bindings: Env` (from `worker-configuration.d.ts`) and the context variables `requestId`, optional `staff`, optional `errorCode`. |
| 16-17 | Every request gets a request id, then the logger (runs last on the way out, so it sees the final status). |
| 18 | `secureHeaders()` on `/api/*` (`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, …). |
| 19-24 | `/c/*`: `secureHeaders()` plus `Cache-Control: no-store` and `X-Robots-Tag: noindex`. Set **after** `next()` on `c.res`: Hono only materialises headers prepared before `next()` when the handler builds its response through `c.json`/`c.body`; a raw `Response` (the asset fallback) would drop them. |
| 26-36 | Error envelope `{ error: { code, message } }`. `HTTPException` → its status, `code` = its message (`'unauthorized'`, `'forbidden'`…); anything else → 500 `internal` / "Something went wrong". `errorCode` is stored for the logger; stack traces and messages of unknown errors are never serialised (T-01-10). |
| 38 | Mounts `GET /api/config`. |
| 40-50 | `notFound`: `/api/*` and `/webhooks/*` get 404 JSON `not_found` (never `index.html` with 200, T-01-12); every other path (e.g. `/c/`) falls back to the SPA via `env.ASSETS.fetch`. The asset response is cloned (`new Response(res.body, res)`) because fetched responses have immutable headers and the `/c/*` middleware must add headers. The path is read for routing only. |
| 52-56 | Default export: `fetch` from Hono; `queue` (Phase 4) and `scheduled` (Phase 2) are empty bodies today — the handler shape is real, the work is not. |

## Notes

- Middleware order matters: `requestId` → `logger` → scoped `secureHeaders` → routes. The logger reads `routePath(c, -1)` after the chain completes.
- No `console.*` here; the logger owns the single `console.log` in `worker/src` (ESLint `no-console: error`).
- `/admin` never reaches this Worker: it is not in `run_worker_first`, so assets serve it directly.

## Tests

- `app/worker/test/config.test.ts` (Task 2) drives `app.request()` with a mock `Env` for `/api/config`, the 404 envelope, and the `/c/` fallback headers.
