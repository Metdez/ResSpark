# app/worker/src/jobs/bank-statements.ts

`syncStatements(env, conn, provider, accessToken, { requestRefresh, now? })`: statement PDFs into the case and the per-account month cells (D-10, BANK-02, BANK-03). Returns `{ pendingCells }`, the number of cells still `pending`; the bank reconcile marks the connection `done` only when this is 0 and history is complete.

## Cell states

| From | To | When |
|------|----|------|
| (none) | `pending` | `ensureMonthCells` creates the 6 cells of `targetMonths(now, 6)` for every listed account. |
| `pending` / `missing` | `available` | A listed statement in the window was downloaded, hash-checked and stored. |
| `pending` | `missing` | The account has at least one statement in the window but not this month. |
| `pending` / `missing` | `not_supported` | `PRODUCTS_NOT_SUPPORTED` (every account of the connection), or an account still has no statements after the one refresh. |
| any | `manual` | Only the client route (`POST /api/c/connections/:id/statements/manual`, Plan 04-04 Task 3). |

`available` and `manual` are never downgraded: downloads skip those cells and the bulk updates only touch `pending`/`missing`.

## Steps

1. `capabilities.statementPdfs` false (a provider without statement PDFs, such as Teller) returns 0 at once (BANK-04: flow by capability, never by id).
2. `listStatements`, with a `/statements/refresh` first when `requestRefresh` is set (staff Refresh before any refresh happened).
3. Not supported: every account of the connection goes `not_supported`, return 0. Not ready: accounts and cells are created, return the pending count (the cron retries).
4. `upsertAccounts` and `ensureMonthCells`.
5. For each account and each statement where `isInWindow`: skip `available`/`manual` cells; otherwise `storeProviderFile` with group = mask (or the account id), name `YYYY-MM.pdf`, `document_type 'bank_statement'`, actor `provider:plaid`. The download runs inside the loader, so a stored path downloads nothing. A `Plaid-Content-Hash` that does not match the SHA-256 of the bytes throws a transient `ProviderError('statement_hash_mismatch')` (retry, then dead letter; never stored). `storeProviderFile` also rejects bytes that are not a PDF. The cell becomes `available` with the document id.
6. Per account with statements: remaining `pending` cells become `missing`. Per account with none: if a refresh was requested on an earlier run, its cells become `not_supported`; otherwise one `/statements/refresh` is sent (once per connection, even with several empty accounts) and `data.statements_refresh_requested_at` is stored, leaving the cells `pending` until `STATEMENTS_REFRESH_COMPLETE` or the next cron.

`shortcut:` one refresh per connection, ever (cost rule). A monthly top-up refresh is Phase 8.
