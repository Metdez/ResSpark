# `app/worker/test/client-portal.test.ts`

Route tests for `/api/c/*` (Plan 02-07), run in the `worker-node` project through `app.request()`. They start from Phase 1's real token exchange, so the cookie under test is exactly what production issues.

## Mocks and setup

- Mocked modules: `db/client-links` (`findClientLink`), `db/portal` (`getPortalState`, `openRequest`, `upsertClientSession`), `db/events`, and `db/client`. Nothing touches a database or the network.
- `findClientLink` returns a valid row for `LINK`, or for `LINK2` when asked for that id. Each row expires in 14 days, is not revoked, and is not opened.
- `STATE`: a five-step `PortalState` (`bank_connect` … `signature`, positions 1 to 5).
- `exchange(id)`: mints a token with the real `hmacKey`/`mintLinkToken`, calls `GET /c/<token>`, asserts the 302 and `rs_client=`, and returns the `rs_client=…` pair.
- `signedCookie(value)`: signs any value as `rs_client` with Hono's own `setSignedCookie` and the real `cookieSecret`, on a throwaway Hono app. It builds expired or malformed payloads without hand-rolled HMAC.
- `getState`, `post(path, cookie, body, header)`: request helpers. `post` sends `X-Requested-With: ResSpark` unless `header` is false.
- `expectPrivacy(res)`: asserts the three privacy headers.
- `beforeEach` resets the in-memory rate-limit windows and captures `console.log` in `logSpy`.

## `GET /api/c/state`

- 200 with exactly the keys `agent_display_name, expires_at, firm_name, opened_at, status, steps`. The steps are in position order 1 to 5, and each has exactly `id, kind, label, position, required, status`. `getPortalState` receives the `ClientCtx` built from the link row.
- The body contains none of `email`, `phone`, `case_id`, `request_id`, `firm_id`, or the request, firm, or link ids.
- `?link_id=<LINK2>&request_id=other` in the query is ignored: the cookie's `LINK` is used.
- `getPortalState` → `null` gives 401 `no_session`.

## Uniform 401

Eight cases: missing cookie, an altered signature character (ten characters from the end, clear of base64 padding bits), revoked link, expired link, unknown link, expired cookie `exp`, non-JSON payload, and a non-UUID `link_id`. Each returns 401 `no_session` with the privacy headers and never calls `getPortalState`. A second test collects all eight bodies and expects one distinct string. It resets the link mock before each exchange.

## `POST /api/c/start`

- Without the header → 403 `bad_origin`, privacy headers, and `openRequest` not called.
- With the header and body `{ request_id: 'other', link_id: LINK2 }` → 200 `{ opened_at }`, and `openRequest` called once with `LINK`.
- Two calls → `openRequest` runs twice (the RPC owns idempotency), and both responses are equal.
- `openRequest` rejecting with `link_inactive` → 401 `no_session`.
- No cookie and no header → 401 (the session check runs first).

## Opening is explicit

- The exchange plus `GET /api/c/state` never call `openRequest`.
- Logger lines include the route patterns `/api/c/state` and `/api/c/start`, and no line contains the cookie value.

## `db/portal` (real module)

Runs the real module through `vi.importActual` against a mocked `createAdminClient`:

- `getPortalState` filters on `id` = request and `firm_id` = firm. It drops `contact_email` and `config`, and sorts unsorted items by position.
- `openRequest` calls `rpc('request_open', { p_link_id })`, returns `opened_at`, and rethrows `link_inactive` from the RPC error message.
