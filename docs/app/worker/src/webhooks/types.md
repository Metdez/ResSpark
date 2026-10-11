# `app/worker/src/webhooks/types.ts`

The contract every webhook verifier implements.

- `VerifiedWebhook`: `payload` is the body, parsed only after the signature matched the raw bytes; `iat` is the Plaid JWT issued-at time (used in Plaid item-webhook event keys).
- `WebhookAdapter`:
  - `id`: `plaid` or `truv` (the `webhook_events.provider` value).
  - `configured(env)`: whether the secret needed to verify exists. The route answers 401 when it does not.
  - `verify(raw, headers, env)`: returns `null` for anything unverifiable. Must hash or MAC the exact string received.
  - `eventKey(v)`: the idempotency key stored in `webhook_events.event_key` (D-02).
