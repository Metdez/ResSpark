# `app/worker/src/webhooks/plaid.test.ts`

Unit tests for `plaidAdapter` in `webhooks/plaid.ts` (worker-node project, no network). Run with `pnpm -C app exec vitest run --project worker-node worker/src/webhooks/plaid.test.ts`.

## Setup

- `makePlaidSigner()` (`test/helpers/plaid-sign.ts`) makes an ES256 key pair and signs a body the way Plaid does: a JWT in the `Plaid-Verification` header whose claims carry the body's SHA-256 and an `iat`.
- `beforeEach` clears the adapter's key cache and seeds it with the signer's `kid` and JWK, so the normal path needs no key fetch.
- `stubVendorFetch` routes any `sandbox.plaid.com` call to a 500 and records it. Tests assert on `vendor.calls` to prove whether a key fetch happened.
- Fixtures: `plaid/session_finished_success.json`, `session_finished_exited.json`, `sync_updates_available.json` and `link_events.json` under `test/fixtures/`.

## Cases

| Case | Proves |
|------|--------|
| SESSION_FINISHED success | Verifies with the cached key, exposes the payload and a numeric `iat`, and keys the event `<link_session_id>:SESSION_FINISHED`; no fetch. |
| SESSION_FINISHED exited | An `EXITED` session verifies the same way with its own key. |
| One byte changed | A body changed after signing fails the body-hash check → `null`. |
| HS256 | A token with `alg: HS256` is refused before any key lookup or fetch (only ES256 is accepted). |
| Token age | An `iat` 6 minutes old is refused; 4 minutes old is accepted (the 5-minute window). |
| Unknown `kid` | Fetched once from `/webhook_verification_key/get` with `{ key_id }` and the client id and secret headers, then served from the cache on the second verify. |
| Failed key fetch | A 500 from the key endpoint makes the body unverifiable → `null`. |
| Item webhooks | Keyed `<item_id>:<webhook_code>:<iat>`, so repeats of the same code at different times are separate events. |
| LINK `EVENTS` | Keyed `<link_session_id>:EVENTS`. |
| No header | A request without `Plaid-Verification` → `null`. |
| `configured` | True with both `PLAID_CLIENT_ID` and `PLAID_SECRET`; false when either is empty. |
