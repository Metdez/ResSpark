# app/worker/src/db/bank.ts

Bank-side data access with the service-role client.

| Function | What it does |
|----------|--------------|
| `consumeReturnNonce(env, nonce)` | One conditional `UPDATE connections SET return_nonce_used_at = now() WHERE return_nonce = $1 AND return_nonce_used_at IS NULL RETURNING id`. Returns the connection id the first time and `null` for an unknown or already-used nonce. Atomic, so two concurrent returns cannot both win (T-04-18). Errors throw `nonce_consume_failed`. |
| `findConnectionAccount(env, connectionId, accountId)` | The `bank_accounts` row with that id on that connection, or `null`. Used by manual statement attribution so a client cannot point at another connection's account (T-04-22). Errors throw `account_lookup_failed`. |

Plan 04-04 Task 2 adds `upsertAccounts`, `ensureMonthCells`, `setMonthCell`, `setAccountCells`, `getAccountCells`, `upsertTransactions` and `deleteTransactions` here.
