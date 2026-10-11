# `app/worker/src/log/logger.ts`

The Worker's only log sink (D-20, PLAT-08): one JSON line per request with exactly the allowlisted keys. Never bodies, headers, query strings, error messages, or concrete paths.

| Lines | What it does |
|-------|--------------|
| 1-2 | `createMiddleware` from `hono/factory`; `routePath` from `hono/route`. |
| 4-13 | `LOG_FIELDS` — the allowlist, in output order: `request_id, route, method, status, duration_ms, firm_id, actor_id, error_code`. Exported so the test asserts the exact key set. |
| 15-19 | The context variables the logger reads: `requestId` (set by `hono/request-id`), optional `staff` (Plan 06), optional `errorCode` (set by `onError`/`notFound`). |
| 23-26 | `logger()` returns middleware that records the start time, lets the chain run, then builds the record. |
| 27-36 | The record. `route` is `routePath(c, -1)` — the **pattern** of the last matched route (`/api/config`, `/c/*`, later `/c/:token`), never `c.req.path`/`c.req.url`; `'/[unmatched]'` if nothing matched. `firm_id`/`actor_id` come from `staff` (Supabase user UUID — not PII); `error_code` is a fixed enum string. |
| 37-39 | The single `console.log` in `worker/src` (ESLint `no-console` is disabled for this one line). `Object.fromEntries(LOG_FIELDS.map(...))` guarantees no extra key can ever be emitted even if `rec` grows; `?? null` keeps absent values (no staff, no error) as `null` so every line has all eight keys — `JSON.stringify` would otherwise drop `undefined` members. |

## Notes

- Platform invocation logs are off in `wrangler.jsonc` so this line is the complete log record for a request.
- Do not add a debug flag or env var that widens the allowlist (plan prohibition, privacy).

## Tests

- `app/worker/src/log/logger.test.ts` spies on `console.log`, requests `/api/nope` and `/api/config` through `app`, and asserts: exactly one line, keys deep-equal `[...LOG_FIELDS]`, `status` 404 / `error_code` `not_found`, the line never contains `nope`, and `route` equals `/api/config` for the config request. The PLAT-08 case (Plan 07) requests `/c/<64-char token>` with `cf-connecting-ip: 198.51.100.7` and `db/client-links` mocked to return no row: the response is 404, there is exactly one line, its `route` is `/c/:token`, its keys equal `[...LOG_FIELDS]`, and the line contains neither the token nor the ip.
