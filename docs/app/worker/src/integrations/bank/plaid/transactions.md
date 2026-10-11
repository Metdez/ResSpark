# app/worker/src/integrations/bank/plaid/transactions.ts

`syncTransactions`, the `/transactions/sync` cursor loop.

Current state: a placeholder that throws `NonRetryableError('not_implemented')`, marked with a `shortcut:` comment. Plan 04-04 Task 2 fills it (count 500, restart from the original cursor on `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`, `personal_finance_category_version: 'v2'`). It exists now so `plaidProvider` type-checks. The bank reconcile does not call it yet.
