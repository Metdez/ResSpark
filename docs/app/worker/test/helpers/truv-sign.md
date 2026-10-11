# `app/worker/test/helpers/truv-sign.ts`

`signTruv(secret, raw)`: produces the `x-webhook-sign` value Truv would send for `raw`: `v1=` + hex HMAC-SHA256 of the exact string under the Access Secret. Tests sign the same string they post, so any byte change (a trailing newline, re-serialized JSON) fails verification.
