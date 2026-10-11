# app/worker/src/jobs/bank-reconcile.ts

`reconcileBank(env, conn, opts)`: the bank branch of `reconcileConnection` (D-04, D-09, BANK-02). It runs from the webhook consumer, the cron, the client return, and staff Refresh.

## With a sealed secret

The connection already has an access token. `openToken` decrypts it and `syncConnected` runs:

| Hint | Work |
|------|------|
| `ITEM` / `ERROR` with a code in `PERMANENT_ITEM_ERRORS` (for example `ITEM_LOGIN_REQUIRED`) | Status `error` with `{ code, message }`, no vendor call, no silent retry. The client step and admin card show "reconnect" from `error_code`. |
| `ITEM` / `PENDING_DISCONNECT` | Logs `connection.pending_disconnect`, then the full run. |
| `TRANSACTIONS` / `SYNC_UPDATES_AVAILABLE` | Sync only. |
| `STATEMENTS` / `STATEMENTS_REFRESH_COMPLETE` | Statements only. |
| none (cron, client, staff) | Sync and statements. |

Sync: `syncTransactions` from `sync_cursor`, `upsertAccounts`, `upsertTransactions(added + modified)`, `deleteTransactions(removed)`, then `sync_cursor` and `data.transactions_update_status` / `data.last_sync_at` are stored (the cursor is saved only after the loop ended with `has_more` false). `data.transactions_update_status` holds Plaid's raw value (for example `HISTORICAL_UPDATE_COMPLETE`). Then `syncBalances` makes one balances call per reconcile (Plan 07-07, D-09): when the provider has `accountBalances`, the result goes to `updateAccountBalances`. A transient `ProviderError` or one in `PERMANENT_ITEM_ERRORS` propagates, so the queue retries or the outer catch sets `error`, and so does a database error. Any other permanent vendor refusal logs `connection.balances_failed { code }` and the reconcile continues. The `plaid` proposer reads these balances for `cash_and_bank_balances`. Statements: `syncStatements` (see `bank-statements.md`), with a refresh request only on staff Refresh when none was requested yet. Status: `done` when history is `HISTORICAL_UPDATE_COMPLETE` and no cell is `pending`, otherwise `syncing` (a first sync with nothing yet is `syncing`, never `done`). A sync-only run on a connection that is not `done` stays `syncing`, because statements were not checked. A permanent, non-transient `ProviderError` from Plaid also ends in `error` with its code; transient errors propagate so the queue retries. `connection_set_status` only moves forward by rank, so a `done` connection is not moved back.

## Without a secret (completion)

| Hint | Result |
|------|--------|
| `LINK` / `EVENTS` (or any LINK code other than `SESSION_FINISHED`) | Stored by the webhook route, ignored here. Nothing changes. |
| `LINK` / `SESSION_FINISHED` with `status` other than `SUCCESS` | Logs `connection.session_exited` with the status. The connection stays `pending`. |
| `LINK` / `SESSION_FINISHED` `SUCCESS` | The webhook's `public_tokens` are exchanged. |
| no LINK hint (cron, client return, staff) | With a `link_ref`, `completeSession` recovers the public tokens from `/link/token/get`. Without one, nothing happens. |

No results means still `pending`. For the first result:

1. `sealToken` with AAD = connection id, then `saveSecret` (upsert on `connection_id`, so a rerun never duplicates).
2. `updateConnection`: `external_id` = Plaid `item_id`, `data.institution_name`, `remove_after` = now + `PLAID_REMOVE_AFTER_DAYS` days (default 30, D-13).
3. `setConnectionStatus(..., 'connected')`, which also moves the request item to `submitted` (migration 0005's `connection_set_status`).

Each extra result (one Link session adding several banks) becomes a sibling connection on the same request item with `data.parent_connection_id`, its own sealed secret, its own `remove_after`, status `connected`, and one queued `reconcile` job.

Only this path can mark a bank connection connected: the `/c/return` route and `LINK/EVENTS` never do (plan prohibition). The access token never reaches rows, events, logs or queue messages.
