# `app/worker/src/db/connections-ops.ts`

Read-side queries for Phase 4 connections. There are two groups: the cron selections (D-04, D-13) and the staff read model (D-10, PAY-04, BANK-03). Every query uses the per-request admin client, and none of them writes.

## Cron queries

| Export | Query |
|--------|-------|
| `listStaleConnections(env, olderThanMinutes = 10, limit = 50)` | Selects from `connections` where all of these hold: `status` is `pending`, `connected`, or `syncing`; `last_webhook_at` is null or older than the cutoff; `last_polled_at` is null or older than the cutoff; `created_at` is older than the cutoff and newer than 14 days (the Truv order expiry). Ordered by `last_polled_at` ascending, with never-polled rows first. The two `.or()` filters are combined with AND by PostgREST, which the live test confirms. In effect the query asks whether the most recent webhook or poll is older than the cutoff, so a connection that got a webhook 2 minutes ago is not polled again. Returns ids. |
| `listStuckWebhookEvents(env, olderThanMinutes = 2, limit = 50)` | Selects from `webhook_events` where `status = 'queued'`, the provider is `plaid` or `truv` (the only providers a `webhook` job carries), and the row arrived before the cutoff. Oldest first. Returns `{ id, provider }`. |
| `expireStalePendingBank(env, hours = 6)` | Selects from `connections` where `kind = 'bank'`, `status = 'pending'`, and `created_at` is older than `hours`, at most 100 per tick. The select embeds `connection_secrets(connection_id)`, and the function returns the rows whose embed is empty. The secret check happens in JS rather than in a new SQL view, so no schema change is needed. PostgREST returns this one-to-one embed as an object or `null`; an array is handled too. |
| `listRemovalCandidates(env, limit = 20)` | Selects from `connections` where `provider = 'plaid'`, `removed_at is null`, and `remove_after <= now()`. It inner-joins `connection_secrets` (`!inner`), so only Items that still hold an access token come back. Ordered by `remove_after asc, id asc`. A `remove_after` equal to now counts as due. |

On error each query throws a fixed token (`connection_list_failed` or `webhook_list_failed`). Postgres error text never leaves the function.

## Tests

`app/worker/test/connections-ops-live.test.ts` (live) seeds connections under the test firm and checks each selection by whether its own ids are present, absent, and in the right order.
