# `app/worker/src/middleware/link-rate-limit.ts`

`linkRateLimit`: a Hono middleware that throttles `GET /c/:token` per client IP so tokens cannot be guessed in bulk (D-18, threat T-01-31). Mounted in `routes/client-link.ts` before the handler, so a limited request never reaches the database.

## Behavior

1. The counter key is `link:<cf-connecting-ip>` (`link:unknown` when the header is missing, as in local tests). The IP is used only as a key; it is never logged or returned.
2. When `env.LINK_RATE_LIMITER` exists (the Workers Rate Limiting binding from `wrangler.jsonc`, 20 requests per 60 s), it calls `limit({ key })` and treats `success: false` as limited.
3. Without the binding, it uses an in-memory sliding window (`limitedInMemory`).
4. Limited → `c.html(RATE_LIMITED_HTML, 429)` ("Too many attempts"). The `/c/*` middleware in `index.ts` adds the no-store, no-referrer and noindex headers to it. Otherwise → `next()`.

## In-memory fallback

| Name | Meaning |
|------|---------|
| `LIMIT` | 20 requests per window. |
| `WINDOW_MS` | 60 000 ms. |
| `MAX_KEYS` | At most 10 000 IPs are tracked; the oldest key is evicted first. |
| `hits` | `Map<key, timestamps[]>`. Each call drops timestamps older than the window, appends now, and re-inserts the key so Map order stays oldest-first for eviction. The 21st request inside the window is limited. |
| `_resetRateLimitForTests()` | Clears `hits`; tests call it in `beforeEach`. |

The `shortcut:` comment records the limit: the map lives in one isolate and resets on redeploy, so a distributed guesser is only slowed per isolate (accepted as T-01-36). The deployed Worker uses the binding (accepted on deploy, 2026-10-11), so the fallback only runs in tests and local dev without the binding.

## Typing

`cf-typegen` declares `LINK_RATE_LIMITER: RateLimit` as always present. The middleware reads it as possibly `undefined` because tests and local runs can omit it.
