# `app/worker/src/routes/client-portal.ts`

The client portal API, mounted at `/api/c` in `index.ts` (Plan 02-07; D-10, D-12, D-15). The phone browser calls it after Phase 1's `GET /c/:token` exchange has set the `rs_client` cookie.

## Contract

| Route | Guard | Success | Errors |
|-------|-------|---------|--------|
| `GET /api/c/state` | cookie | 200 `PortalState` | 401 `no_session` |
| `POST /api/c/start` | cookie + `X-Requested-With: ResSpark` | 200 `{ opened_at }` | 401 `no_session`, 403 `bad_origin` |

Every response, errors included, carries `Cache-Control: no-store`, `X-Robots-Tag: noindex`, and `Referrer-Policy: no-referrer` (`clientPrivacyHeaders` and `secureHeaders` in `index.ts`).

## Code

| Part | What it does |
|------|--------------|
| `noSession()` | Builds the single `HTTPException(401, 'no_session')`, so every session failure has one body. |
| `.use('*', clientSession)` | Every route needs a verified cookie. Handlers read only `c.var.client`. |
| `GET /state` | `getPortalState(env, client)`. `null` (the request was deleted under the link) → 401, the same as no link. Otherwise the allow-listed DTO. Reading the state never marks anything opened. |
| `POST /start` | `requireClientHeader`, then `openRequest(env, client.linkId)`. The body is never read, so ids posted in it are ignored. `link_inactive` (revoked or expired between the cookie check and the RPC) → 401 `no_session`. Any other error goes to `app.onError` as a 500. This is the **only** code path that marks a request opened (D-10, C2): neither the exchange nor any GET does. |

## Tests

`app/worker/test/client-portal.test.ts`.
