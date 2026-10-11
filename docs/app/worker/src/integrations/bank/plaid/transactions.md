# app/worker/src/integrations/bank/plaid/transactions.ts

The Plaid `/transactions/sync` cursor loop (D-09, BANK-02).

| Part | What it does |
|------|--------------|
| `PlaidTransaction`, `PlaidAccount`, `SyncPage` | The fields of the Plaid response this module reads. |
| `normalizeTransaction(t)` | Plaid transaction to `NormTransaction`: `transaction_id` becomes `plaid_transaction_id`, `account_id` becomes `external_account_id`, `personal_finance_category.primary/detailed` become `category_primary/detailed`, missing `authorized_date`, `merchant_name`, `iso_currency_code` become `null`, missing `pending` becomes `false`. |
| `normalizeAccount(a)` | Plaid account to `NormAccount` (also used by `statements.ts`). |
| `mapUpdateStatus(s)` | `HISTORICAL_UPDATE_COMPLETE` gives `historical`, `INITIAL_UPDATE_COMPLETE` gives `initial`, anything else (including `NOT_READY` and unknown values) gives `not_ready`. |
| `syncTransactions(env, accessToken, cursor)` | Posts `{ access_token, cursor, count: 500, options: { personal_finance_category_version: 'v2' } }` page after page until `has_more` is false, collecting `added`, `modified` and `removed` ids. Returns the final `next_cursor`, the mapped `status`, the raw `statusRaw` string and the last page's `accounts`. |

## Mutation during pagination

When Plaid answers `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`, everything collected so far is dropped and the loop restarts from the original cursor (Plaid's documented recovery), at most 3 restarts (`MAX_RESTARTS`) before the error propagates. Any other `ProviderError` propagates unchanged; the caller decides retry versus stop by `transient` and `PERMANENT_ITEM_ERRORS`.

The v2 category taxonomy is requested so Phase 7 can map categories from one known version.
