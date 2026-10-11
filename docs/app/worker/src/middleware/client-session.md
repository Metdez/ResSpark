# `app/worker/src/middleware/client-session.ts`

The two guards on every client-portal route (`/api/c/*`, Plan 02-07). The client has no account and no database identity. The only thing that says who they are is the signed `rs_client` cookie that Phase 1's `GET /c/:token` exchange set (D-15, PITFALLS C2 and C3).

## `ClientCtx`

What a route gets as `c.var.client`. Every field comes from the verified `client_links` row, never from the request.

| Field | Source |
|-------|--------|
| `linkId` | `client_links.id` |
| `requestId` | `client_links.request_id` |
| `firmId` | `client_links.firm_id` |
| `expiresAt` | `client_links.expires_at` |
| `openedAt` | `client_links.opened_at` |

## `resolveClient(env, raw)` (private)

It turns the cookie value into a `ClientCtx` or `null`. Every check returns the same `null`, so the caller cannot tell which one failed:

1. No cookie (`undefined`) or a bad signature (`false`) → `null`.
2. The value must parse as JSON → otherwise `null`.
3. `link_id` must be a UUID-shaped string, and `exp` must be a finite number greater than now. This is the cookie's own 24 h lifetime, checked independently of the link.
4. `findClientLink(env, uuidToBytes(link_id))` re-reads the link on **every** call. A missing row, a null `request_id`, `revoked_at` set, or `expires_at` not strictly in the future (full timestamp compare, so an unparseable value also fails) → `null`. A link revoked or expired while the client is on the page therefore fails on the next call (PORT-06).

`findClientLink` throwing (a database error) is not a session failure. It reaches `app.onError` as a 500 `internal`.

## `clientSession`

A Hono middleware typed `{ Bindings: Env; Variables: { client: ClientCtx } }`. It reads the cookie with `getSignedCookie(c, await cookieSecret(env.CLIENT_LINK_HMAC_KEY), 'rs_client')`. That is the same derived secret Phase 1 signs with, so the cookie MAC key is never the link MAC key. On `null` it throws `HTTPException(401, 'no_session')`, which `app.onError` turns into one fixed body `{ error: { code: 'no_session', message: 'no_session' } }`. Otherwise it sets `client` and continues.

It never reads the query string, route params, body, or any header for identity.

## `requireClientHeader`

The CSRF guard for `POST /api/c/*`. The cookie is already `SameSite=Lax`. On top of that, the request must carry `X-Requested-With: ResSpark`. A cross-site HTML form cannot set custom headers, and a cross-site `fetch` with one needs a CORS preflight that this Worker never approves. A missing or different value throws `HTTPException(403, 'bad_origin')`.

Routes put `clientSession` first (`use('*')`), so a request with neither cookie nor header gets 401, not 403.

## Tests

`app/worker/test/client-portal.test.ts` covers every failure path (missing, altered signature, revoked, expired link, unknown link, expired cookie `exp`, non-JSON payload, bad `link_id`). It checks that all of them return byte-identical 401 bodies, and that a missing header returns 403.
