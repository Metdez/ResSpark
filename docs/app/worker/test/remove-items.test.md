# app/worker/test/remove-items.test.ts

Live proof for BANK-06 against the real Supabase project (test firm); only Plaid `/item/remove` is stubbed (`item_remove.json`, or 400 `ITEM_NOT_FOUND` for tokens in the `gone` set). Skips unless `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `TOKEN_ENC_KEY_1` are set.

`conn(externalId, opts)` inserts a Plaid connection with plan-unique item ids (`item_fixture_0404_rm_*`), seals `access-<id>` (unless `secret: false`), sets it `done`, and sets `remove_after` (default one second ago).

1. A due connection with an account, one month cell and one transaction is a removal candidate; `removeItem` posts `/item/remove` with the unsealed token, deletes the secret, sets `removed` with `removed_at`, logs one `connection.removed`, keeps the transaction and the cell, and is no longer a candidate.
2. `remove_after` equal to the current time is a candidate; a connection without a secret never is.
3. `ITEM_NOT_FOUND` from Plaid still ends `removed` with the secret deleted, run through the queue consumer as a `remove_item` job (acked, not retried).

`afterAll` calls `fx.cleanup()`; accounts, cells, transactions and secrets cascade with the connections.
