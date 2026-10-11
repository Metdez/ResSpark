# `app/worker/src/cron.ts`

The Worker's `scheduled()` handler (D-04, D-13, WEBH-02, BANK-06). `app/wrangler.jsonc` declares two Cron Triggers: `*/15 * * * *` (the reconciler) and `0 3 * * *` (the daily step, in UTC). The handler branches on `controller.cron`.

| Export / part | What it does |
|---------------|--------------|
| `DAILY_CRON` | `'0 3 * * *'`. Must match the second entry of `triggers.crons`. |
| `BATCH` | 100. This is the most messages Cloudflare Queues accepts in one `sendBatch` call. |
| `step(fallback, fn)` | Runs one cron step. If the step throws, it logs `{ route: 'cron', error_code: 'cron_step_failed' }` and returns the fallback, so one broken step never stops the others. The log line carries no error text, so no Postgres or vendor message reaches the log. |
| `enqueue(env, jobs)` | Calls `env.JOBS.sendBatch` in chunks of 100. Messages carry ids only (`Job` from `jobs/index.ts`). |
| `reconcileTick(env)` | Runs every 15 minutes in three steps. (1) `listStuckWebhookEvents` finds ledger rows still `queued` 2 minutes after they arrived, which means the Worker crashed between the insert and `JOBS.send`. Each becomes a `{ type: 'webhook', provider, ref }` job. (2) `listStaleConnections` finds non-terminal connections with no webhook or poll in 10 minutes, younger than 14 days, at most 50. Each becomes a `{ type: 'reconcile', ref }` job. The webhook jobs go first in the same batch. (3) `expireStalePendingBank` finds pending bank connections older than 6 hours that never got an access token, so their Hosted Link session is gone. Each is set to `error` with `{ code: 'link_expired' }` through `setConnectionStatus`, the one status writer. Returns `{ requeued, reconciles, expired }`. `requeued` and `reconciles` are 0 if the send failed. |
| `dailyJobs(env)` | Runs daily. `listRemovalCandidates` finds Plaid connections with `remove_after <= now()` that are not removed and still hold a secret, oldest first, at most 20. Each becomes a `{ type: 'remove_item', ref }` job. If nothing is due, nothing is sent. Returns `{ removals }`. The queue consumer's `remove_item` branch makes the vendor call (Plan 04). |
| `scheduled(controller, env, ctx)` | Runs `dailyJobs` when `controller.cron === DAILY_CRON`, otherwise `reconcileTick`. The logger allowlist has no count fields, so the counts are written as one firm-level event per run: action `cron.tick` or `cron.daily`, `actor_type: 'system'`, payload = the counts, under `defaultFirmId`. This event is the heartbeat staff can see. The handler then prints one console line with the allowlisted fields `route: 'cron'`, `status: 200`, and `duration_ms`. |

## Logics push sweep (Phase 5)

After the branch, every trigger (both crons) runs `logicsPushSweep(env)` (`jobs/logics-push-sweep.ts`) inside its own `step`, so a failing sweep is logged as `cron_step_failed` and skips nothing else. It moves `sending` rows claimed over 10 minutes ago to `unknown` (`consumer_lost`) and re-enqueues `queued` rows idle over 5 minutes (D-03, Pitfall 3). The 15-minute cadence bounds how long a lost consumer can block a case. Its counts are not added to the `cron.tick` / `cron.daily` payload; the RPC writes a `logics.push_unknown` event per swept row.

## Why cron and webhooks agree on the final status

Cron does not set a connection's status itself. The only exception is the `link_expired` RPC call. Everything else is enqueued as a job, and the consumer calls the same `reconcileConnection` that the webhook path and staff Refresh use.

All status writes go through `connection_set_status`. That function locks the request, then the connection, then the item, and it never moves a status backwards. So when a cron reconcile and a webhook run at the same time, both end at the same status. The one that runs second either gets `applied=false` or hits the "equal status" case, which changes nothing and writes no second event.

Every write in a reconcile is either an upsert or a call to that same status function. If a reconcile is cut off partway, running it again is safe, and the next tick finishes the work.

## Local trigger

`curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*"` under `vite dev`. Use `0+3+*+*+*` for the daily step.

## Tests

`app/worker/src/cron.test.ts` is a unit test; the db modules are mocked.
