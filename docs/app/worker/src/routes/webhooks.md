# `app/worker/src/routes/webhooks.ts`

`POST /api/webhooks/:provider` (D-01, WEBH-01), mounted in `index.ts` at `/api/webhooks`.

| Step | Behaviour |
|------|-----------|
| Adapter lookup | `adapters[provider]` for own keys only. Unknown provider: 404 `not_found`. |
| Configured check | No secret for the provider: 401 `invalid_signature` (an unconfigured provider cannot be verified; same answer as a bad signature, no hint). |
| Raw body | `await c.req.text()` once. No `c.req.json()` and no validator on this route: re-serialized JSON breaks both Truv's HMAC and Plaid's body hash. |
| Verify | `adapter.verify(raw, headers, env)`. Failure: one `events` row `webhook.rejected` with payload exactly `{ provider }` (no body, no header values) under `defaultFirmId(env)`, then 401 `invalid_signature`. |
| Ledger | `recordWebhook(env, provider, eventKey, payload)`. `null` (duplicate): 200 `{ ok: true, duplicate: true }` and nothing is enqueued. |
| Enqueue | `env.JOBS.send({ type: 'webhook', provider, ref: <webhook_events.id> })`: ids only, never the payload. Then 200 `{ ok: true }`. |

Errors use `HTTPException(status, { message: code })`, which the app's `onError` turns into `{ error: { code, message } }` JSON and records as `errorCode` for the allowlisted logger. The handler never calls a vendor (the Plaid key fetch on a cache miss is the one exception) and never changes a connection; the consumer does that after re-reading provider state. Measured live: the first POST answered in about 100 ms.

## Tests

`routes/webhooks.test.ts` (unit, mocked DB): 404, unconfigured 401, valid 200 + enqueue, duplicate, invalid signature with the `webhook.rejected` payload, JSON content type, and no body or signature in console output. `connections-tracer.test.ts` proves the same path live.
