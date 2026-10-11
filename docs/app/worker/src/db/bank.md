# app/worker/src/db/bank.ts

Bank-side data access with the service-role client.

| Function | What it does |
|----------|--------------|
| `consumeReturnNonce(env, nonce)` | One conditional `UPDATE connections SET return_nonce_used_at = now() WHERE return_nonce = $1 AND return_nonce_used_at IS NULL RETURNING id`. Returns the connection id the first time and `null` for an unknown or already-used nonce. Atomic, so two concurrent returns cannot both win (T-04-18). Errors throw `nonce_consume_failed`. |
| `findConnectionAccount(env, connectionId, accountId)` | The `bank_accounts` row with that id on that connection, or `null`. Used by manual statement attribution so a client cannot point at another connection's account (T-04-22). Errors throw `account_lookup_failed`. |
| `CellStatus`, `AccountCell` | The five month-cell states (`pending`, `available`, `not_supported`, `manual`, `missing`) and a cell row. |
| `upsertAccounts(env, connectionId, accounts)` | Upserts `bank_accounts` on `(connection_id, external_account_id)` with explicit columns (statement listings carry an extra `statements` field that must not reach the insert). Returns `external_account_id` to `bank_accounts.id`. An empty list returns `{}` without a query. |
| `updateAccountBalances(env, connectionId, balances)` | For each `NormBalance`, updates `balance_current`, `balance_available` and `balance_as_of` on the `bank_accounts` row matched by `(connection_id, external_account_id)`. One update per account, since a connection has only a few. An account that is not stored yet is ignored. Returns the number of rows updated. A database error throws `balance_update_failed`. |
| `listConnectionAccounts(env, connectionId)` | Ids of every account of a connection (used to mark all cells `not_supported`). |
| `ensureMonthCells(env, accountIds, cells)` | Inserts a `pending` cell per account and month, `ignoreDuplicates`, so existing cells keep their status. |
| `setMonthCell(env, accountId, year, month, status, documentId?)` | Upserts one cell on `(bank_account_id, year, month)` with the status and document id (creates it when missing). |
| `setAccountCells(env, accountId, status, onlyFrom?)` | Sets every cell of an account, limited to cells whose current status is in `onlyFrom`, so `available` and `manual` are never downgraded. |
| `getAccountCells(env, accountId)` | The account's cells. |
| `upsertTransactions(env, connectionId, accountIdByExt, txns)` | Upserts `bank_transactions` on `plaid_transaction_id` in chunks of 500, so reruns never duplicate. Transactions of an account not in the map are skipped. Returns the number written. |
| `deleteTransactions(env, ids)` | Deletes by `plaid_transaction_id` (Plaid's `removed[]`), in chunks of 500. |

Errors throw fixed tokens (`account_upsert_failed`, `cell_insert_failed`, `cell_update_failed`, `cell_lookup_failed`, `transaction_upsert_failed`, `transaction_delete_failed`).
