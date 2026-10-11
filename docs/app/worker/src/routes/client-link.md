# `app/worker/src/routes/client-link.ts`

`GET /c/:token`: the exchange that turns a client link into a session cookie (D-18). Mounted in `index.ts` with `app.route('/c', clientLinkRoute)`. `wrangler.jsonc` lists `/c/*` in `run_worker_first`, so the Worker answers this path before the SPA.

## Flow

1. `linkRateLimit` (see `middleware/link-rate-limit.ts`) runs first and may return the 429 page before any lookup.
2. `verifyLinkToken(c.env, token)` returns the `client_links` row or `null`.
3. `null` → `c.html(INVALID_LINK_HTML, 404)`. Malformed, unknown, tampered, revoked and expired tokens all get this same response.
4. Valid → `setSignedCookie` writes `rs_client`:
   - value: JSON `{ link_id, exp }`, where `exp` is now + 24 h in ms epoch;
   - signed with `cookieSecret(CLIENT_LINK_HMAC_KEY)`, a key distinct from the link MAC key;
   - attributes `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`.
5. `c.redirect('/c/', 302)`. The `Location` is a constant, so the token never appears in the response.

## Cookie contract (Phase 2 reads it)

Name `rs_client`; read with `getSignedCookie(c, await cookieSecret(env.CLIENT_LINK_HMAC_KEY), 'rs_client')`; parse the JSON and reject it when `exp` has passed.

## What it never does

- Write `opened_at`. That happens on Phase 2's Start tap through `request_open`.
- Put the token in the body, the `Location` header, the cookie, or a log line. The logger records the route pattern `/c/:token`, never the path.

## Headers

The `/c/*` middleware in `index.ts` adds `Cache-Control: no-store`, `X-Robots-Tag: noindex`, and `secureHeaders()` (which sets `Referrer-Policy: no-referrer`) to the 302, 404 and 429 responses.
