# app/worker/src/integrations/bank/start.ts

`startBank(env, ctx)` runs when the client taps "Connect your bank" (D-08, BANK-01). Called by `POST /api/c/connections/bank/start` after the consent and configuration gates.

## Inputs and output

- `ctx`: the Plan 03 `StartCtx` (`client`, `item`, `caseRow`) plus `origin`, the Worker's own origin from the request URL. Both URLs given to Plaid are built from `origin` and fixed paths, never from the client body (T-04-19).
- Returns `{ connection_id, hosted_link_url, capabilities, reused_row }`.

## Steps

1. `provider = bankProvider(env)` (selected by `BANK_PROVIDER`).
2. Row reuse: the latest connection for the item is reused when it is a `bank` connection, still `pending`, younger than 30 minutes (`REUSE_WINDOW_MS`), and has no sealed secret. Otherwise a new `connections` row is inserted first ("row before URL": the row exists before Plaid knows about the session).
3. A 16-byte random nonce, base64url (22 characters).
4. `firmName` reads `firms.name` (falls back to `ResSpark`) for Plaid's `client_name`.
5. `provider.createLinkSession` with the request id, the firm name, `webhookUrl = <origin>/api/webhooks/plaid`, `returnUrl = <origin>/c/return?nonce=<nonce>`, and the 180-day statement window from `statementsWindow`. A `ProviderError` marks the connection `error` with its code and is rethrown (the route answers 502).
6. `updateConnection` stores `link_ref` (the link token), the new `return_nonce` and `data.link_expires_at`. Overwriting the nonce means the previous tap's return URL no longer resolves.
7. Logs `connection.started` with `{ provider, reused_row }` under the client actor `link:<linkId>`.

Every tap mints a fresh link token, even on a reused row: Hosted Link URLs are short-lived (30 minutes) and single-session.
