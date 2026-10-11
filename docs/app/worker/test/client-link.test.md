# `app/worker/test/client-link.test.ts`

Route tests for `GET /c/:token`, run in the `worker-node` project through `app.request()` with a mock `Env`. `db/client-links` and `db/client` are mocked, so no database is touched. Tokens are minted with the real `hmacKey` / `mintLinkToken`.

## Setup

- `ENV`: a test HMAC secret, dummy Supabase values, and an `ASSETS.fetch` stub that returns the SPA shell.
- `row(over)`: a valid `client_links` row (version 1, expires in a day) with overrides.
- `tampered()`: a valid token with one MAC bit flipped. `random64()`: 48 random bytes as base64url.
- `beforeEach` silences the logger and makes `findClientLink` return a valid row.

## Valid token

- 302 to exactly `/c/`; `Set-Cookie` has `rs_client=`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=86400` and `Path=/`; neither the cookie nor the body contains the token.
- The 302 carries `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.
- No database write: the row's `opened_at` stays `null`, and neither `createClientLink` nor `createAdminClient` is called.

## Failures

- Malformed, random 64 chars, tampered MAC, revoked and expired → each is 404 `text/html` with `no-store`, contains the invalid-link heading and "Ask your agent for a new link.", and contains neither the token nor the `request_id`.
- All five bodies are byte-identical.
- A wrong-length token never reaches `findClientLink`.

## Rate limiting

- With a `LINK_RATE_LIMITER` binding that refuses, the response is the 429 page with `no-store`, and `findClientLink` is not called.
- Without the binding, the 21st request from one IP inside the window is 429 while another IP is still served. `_resetRateLimitForTests()` clears the in-memory window before each test.

## Copied signing link (Plan 06-06)

- A valid token with `?step=3F2504E0-…` redirects to `/c/?step=3f2504e0-…` (lowercased).
- `step=../admin`, `step=javascript:alert(1)`, an empty `step`, and a UUID with a trailing `x` each redirect to exactly `/c/`.
- `step=<uuid>&next=https://evil.example` forwards only the step.
- An invalid token with a valid `step` returns the same 404 body as without it.
- `/c/sign/<uuid>` is not treated as a token: `findClientLink` is never called, and the SPA fallback answers 200 with the client CSP (including `https://cdn.docuseal.com`).
