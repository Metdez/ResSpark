# `app/worker/src/routes/client-portal.ts`

The client portal API, mounted at `/api/c` in `index.ts` (Plan 02-07; D-10, D-12, D-15). The phone browser calls it after Phase 1's `GET /c/:token` exchange has set the `rs_client` cookie.

## Contract

| Route | Guard | Success | Errors |
|-------|-------|---------|--------|
| `GET /api/c/state` | cookie | 200 `PortalState` | 401 `no_session` |
| `POST /api/c/start` | cookie + `X-Requested-With: ResSpark` | 200 `{ opened_at }` | 401 `no_session`, 403 `bad_origin` |
| `POST /api/c/heartbeat` | cookie + `X-Requested-With: ResSpark` | 200 `{ ok: true }` | 400 `bad_request`, 401 `no_session`, 403 `bad_origin`, 429 `rate_limited` |

Every response, errors included, carries `Cache-Control: no-store`, `X-Robots-Tag: noindex`, and `Referrer-Policy: no-referrer` (`clientPrivacyHeaders` and `secureHeaders` in `index.ts`).

## Code

| Part | What it does |
|------|--------------|
| `noSession()` | Builds the single `HTTPException(401, 'no_session')`, so every session failure has one body. |
| `badRequest()` | `HTTPException(400, 'bad_request')`, one code for every invalid heartbeat body. |
| `AGENT_CLASSES` / `AgentClass` | The `user_agent_class` enum, matching the `client_sessions` CHECK: `phone`, `tablet`, `desktop`. |
| `optionalText(value, max)` | `undefined` or `null` → `null`. A string of at most `max` characters passes through. Anything else (a number, an over-long string) → 400. |
| `.use('*', clientSession)` | Every route needs a verified cookie. Handlers read only `c.var.client`. |
| `GET /state` | `getPortalState(env, client)`. `null` (the request was deleted under the link) → 401, the same as no link. Otherwise the allow-listed DTO. Reading the state never marks anything opened. |
| `POST /start` | `requireClientHeader`, then `openRequest(env, client.linkId)`. The body is never read, so ids posted in it are ignored. `link_inactive` (revoked or expired between the cookie check and the RPC) → 401 `no_session`. Any other error goes to `app.onError` as a 500. This is the **only** code path that marks a request opened (D-10, C2): neither the exchange nor any GET does. |
| `POST /heartbeat` | `requireClientHeader`, then the per-link window `allowInWindow('hb:<linkId>', 10, 60_000)`. The 11th call inside 60 s → 429 `rate_limited`, and nothing is written. The body is parsed with `c.req.json().catch(() => ({}))`, so a missing or non-JSON body counts as `{}`. It must be a plain object (an array → 400). `last_step` is at most 64 characters, `last_error` at most 200, and `user_agent_class` is one of the enum or absent. Any other `link_id` or `request_id` field is ignored. Then `upsertClientSession` runs with the cookie's `linkId`, and the response is `{ ok: true }`. The SPA (Plan 08) sends it every 30 s while the tab is visible and on each step change (D-12). |

## Rate-limit shortcut

The heartbeat window is the in-memory one from `link-rate-limit.ts`, keyed `hb:<link id>`. It lives in one isolate and resets on redeploy, which is acceptable for a 30 s cadence (one call every 30 s is 2 per minute against a limit of 10). The `shortcut:` comment records the upgrade path: a Workers Rate Limiting binding keyed by link. The existing `LINK_RATE_LIMITER` binding is keyed per IP for the token exchange, so it does not fit here.

## Tests

`app/worker/test/client-portal.test.ts`.
