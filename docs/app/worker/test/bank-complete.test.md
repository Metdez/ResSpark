# app/worker/test/bank-complete.test.ts

Live tracer for the bank completion half of Plan 04-04 (BANK-01, BANK-02). Runs against the real Supabase project under the test firm `00000000-0000-0000-0000-00000000000e`; only Plaid (`sandbox.plaid.com`) and the `ASSETS` binding are stubbed. Skips with a console warning unless `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY` and `TOKEN_ENC_KEY_1` are set. Run with `pnpm -C app test:live`.

## Setup

- `seedConnectionFixture(env, { kind: 'bank' })`: one opened request with a `bank_connect` item and a client link; the cookie comes from `GET /c/<token>`.
- `cleanLeftovers` deletes webhook ledger rows `ls_fixture_1/2:SESSION_FINISHED` and test-firm connections with the fixture link refs or item ids, so a crashed earlier run cannot collide.
- A local ES256 signer (`makePlaidSigner`) whose public key is injected with `_setPlaidKeyForTests`.
- Stubs: `/link/token/create` (`link_token_create.json`), `/link/token/get` (`link_token_get.json` with the public token rewritten to `public-sandbox-fixture-3`), `/item/public_token/exchange` (`exchange.json` for `public-sandbox-fixture-1`, otherwise `item_fixture_3`; the unique `(provider, external_id)` index needs distinct item ids).

## Tests

1. The item view reports Plaid as configured with all three capabilities.
2. Start before consent is 409 `consent_required`; after consent the start returns the hosted link URL, and the captured `/link/token/create` body has every D-08 field (products, required-if-supported statements, 365 days, 180-day window ending today, 1800 s, not mobile, nonce URL on `http://localhost`, webhook path, request id, firm name). The row is `pending` with the link ref and a 22-character nonce.
3. A second tap reuses the row, calls create again, and changes the nonce.
4. `/c/return`: the old nonce redirects without a job; the new one sends exactly one reconcile job, sets `return_nonce_used_at`, logs one `connection.returned`; reusing it sends nothing; no nonce serves the SPA; `?nonce=x` redirects without reaching the link-token handler; status stays `pending`.
5. The signed `session_finished_success.json` webhook goes through the ledger and `queue()`: exchange is called with `public-sandbox-fixture-1` and `/link/token/get` is not; one secret with `key_version 1` and a 16-character IV opens to `access-sandbox-fixture-1` (and fails for another uuid); the row is `connected` with `external_id`, `connected_at` and `remove_after` 30 days out (within an hour); the item is `submitted`; `connection.connected` is logged and no event payload contains the access or public token.
6. `session_finished_exited.json` against a second pending connection logs `connection.session_exited`, keeps it `pending`, and writes no secret.
7. A third pending connection with only a `link_ref` is recovered by `reconcileConnection(..., { source: 'cron' })` through `/link/token/get` then exchange, and gets `data.institution_name = 'First Platypus Bank'`.

`afterAll` removes the ledger rows and calls `fx.cleanup()` (secrets cascade with connections). Events are append-only and stay under the test firm.
