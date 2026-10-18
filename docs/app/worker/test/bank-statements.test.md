# app/worker/test/bank-statements.test.ts

Live proof for the connected half of the bank flow (BANK-02, BANK-03). Real Supabase (test firm); only Plaid is stubbed. Skips with a warning unless `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `TOKEN_ENC_KEY_1` are set.

## Setup

- `seedConnectionFixture(env, { kind: 'bank' })`, then leftovers from a crashed run are removed (test-firm connections with the plan-unique item ids `item_fixture_0404_*`, and `tx_0404_*` transactions).
- `connected(externalId)` inserts a Plaid connection, seals `access-<id>` with `sealToken`, and sets it `connected`.
- Sync pages are inline: page 1 (two `acc_1` transactions on the same date), page 2 (one `acc_2`), page 3 (one more, removes `tx_0404_b`, `HISTORICAL_UPDATE_COMPLETE`, cursor `c3`). Page 2 fails once with `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`.
- `/statements/list` returns statements for `acc_1` (mask `0000`) for the two newest window months, pinned to the run's clock with `targetMonths(new Date(), 6)`, and none for `acc_2`. `/statements/download` returns `fixtures/files/tiny.pdf` with `Plaid-Content-Hash` = its SHA-256. `/accounts/get` (the balances call after every sync, Plan 07-07) returns no accounts, so no balance is written and no real Plaid host is called.

## Tests

1. First cron reconcile: status `syncing`; sync cursors `null, c1, null, c1, c2`; 2 accounts; 3 transactions (4 added minus 1 removed), read `date DESC, plaid_transaction_id ASC`; `sync_cursor c3`; `transactions_update_status` stored; `acc_1` has 2 `available` cells with documents and 4 `missing`; `acc_2` has 6 `pending`; 2 `bank_statement` documents with the header hash, actor `provider:plaid`, and a `/bank/0000/YYYY-MM.pdf` key; exactly one `/statements/refresh`.
2. Second reconcile (30 s budget): `acc_2` cells `not_supported`, status `done`, no new download or refresh; the two `bank_statement` documents are joined by two generated `bank_transactions` documents (`Transactions - August 2026 - x1111.pdf` for acc_2, `Transactions - July 2026 - x0000.pdf` for acc_1's missing July), actor `provider:resspark`, each attached to its month cell while the cell status stays `not_supported` / `missing` (quick task 261018-kgl, item H); the item is `approved` (0011).
3. `SYNC_UPDATES_AVAILABLE` hint: one `/transactions/sync` from cursor `c3`, then the `/accounts/get` balances call, no statements calls.
4. `ITEM_LOGIN_REQUIRED` hint on a fresh connected connection: status `error` with that code and no vendor call. (A `done` connection keeps `done`: `connection_set_status` only moves forward by rank.)
5. `PRODUCTS_NOT_SUPPORTED`: every cell of every account `not_supported`, and the connection reaches `done` once history is complete.

`afterAll` removes the storage objects and documents of the item, then `fx.cleanup()` (accounts, cells, transactions and secrets cascade with connections).
