# `app/worker/src/webhooks/truv.ts`

Truv webhook verifier (D-02). Truv signs every webhook with `X-WEBHOOK-SIGN: v1=<hex HMAC-SHA256(Access Secret, raw body)>` (docs.truv.com/docs/webhooks). The Access Secret is `TRUV_SECRET`; there is no separate webhook secret.

| Part | What it does |
|------|--------------|
| `enc`, `hex` | UTF-8 encode a string; hex-encode a MAC. |
| `configured` | True when `TRUV_SECRET` is set. |
| `verify` | Reads `x-webhook-sign`; anything not starting with `v1=` (or no secret) is `null`. Imports the secret as an HMAC-SHA256 key, signs the raw string, and compares `v1=` + hex with the header: lengths first, then `timingSafeEqual` from `node:crypto` (constant time; available in Workers through `nodejs_compat` and in Node tests). Only after a match is the body parsed; invalid JSON or a body without a string `webhook_id` is `null`. |
| `eventKey` | `webhook_id`, Truv's idempotency key. |

A trailing newline or any re-serialization changes the MAC, which is why the route reads the body with `c.req.text()` only.

## Tests

`truv.test.ts`: valid signature, wrong secret, missing `v1=` prefix, verified body without `webhook_id`, and raw-byte sensitivity (trailing newline).
