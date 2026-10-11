# app/worker/src/jobs/remove-items.ts

`removeItem(env, id)`: retention removal of a Plaid Item (D-13, BANK-06). The daily cron (`cron.ts`, `listRemovalCandidates`: Plaid connections with `remove_after <= now()`, not removed, still holding a secret) sends one `{ type: 'remove_item', ref }` job per connection; the consumer calls this.

1. `getConnection`; missing is `NonRetryableError('connection_not_found')` (acked, recorded).
2. `getSecret`; none logs `connection.remove_skipped` with `{ reason: 'no_secret' }` (system actor) and returns.
3. `bankProvider(env, conn.provider).removeConnection(env, openToken(...))`, which POSTs Plaid `/item/remove` and stops billing for the Item.
4. `ITEM_NOT_FOUND` or `INVALID_ACCESS_TOKEN` from Plaid (`GONE`) means Plaid no longer knows the token, so it counts as already removed. Any other error propagates: transient ones retry with backoff, permanent ones are acked and recorded as `job.failed`.
5. `deleteSecret`, then `setConnectionStatus(..., 'removed', { reason: 'retention', remove_after })`, which sets `removed_at` and logs `connection.removed`.

What stays: every `documents` row (statement PDFs), `bank_transactions`, `bank_accounts` and `bank_statement_months` row. They are the client's data and remain in the case; only the access token and the vendor-side Item go away.
