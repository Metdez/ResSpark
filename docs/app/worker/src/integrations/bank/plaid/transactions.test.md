# app/worker/src/integrations/bank/plaid/transactions.test.ts

Unit tests for the sync loop. Plaid is stubbed; the stub answers by request cursor (`null` gives page 1, `cur1` page 2, anything else page 3 with `HISTORICAL_UPDATE_COMPLETE`).

| Test | Proves |
|------|--------|
| pages until done | 3 pages give 6 added, 1 removed, cursor `cur3`, status `historical`, accounts from the last page; every request has `count: 500` and `personal_finance_category_version: 'v2'`; cursors chain `null, cur1, cur2`. |
| mutation restart | Page 2 fails once with `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`; cursors are `null, cur1, null, cur1, cur2` and the result is the full set once. |
| `normalizeTransaction` | Categories, null `authorized_date`, `pending`, `merchant_name`. |
| `mapUpdateStatus` | The three known values and an unknown one. |
| errors | 429 is transient; `ITEM_LOGIN_REQUIRED` is permanent. |
| empty first sync | `NOT_READY` with no transactions maps to `not_ready`. |
