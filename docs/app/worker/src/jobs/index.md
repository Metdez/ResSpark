# `app/worker/src/jobs/index.ts`

The Cloudflare Queues consumer for `resspark-jobs` and its dead-letter queue `resspark-jobs-dlq` (D-03, WEBH-01). Exported as `queue` and wired into the Worker's default export in `index.ts`.

## Exports

- `Job`: the message union. Messages carry ids only (`ref`), never payloads or secrets (128 KB limit, Phase 1 D-20): `webhook` (`ref` = `webhook_events.id`), `reconcile` (`ref` = connection id), `remove_item` (Plan 04), and `LogicsPushJob` (`{ type: 'logics_push', provider: 'logics', ref }`, `ref` = `logics_pushes.id`, Phase 5).
- `NonRetryableError`: re-exported from `integrations/provider-error.ts`.
- `retryDelaySeconds(attempts)`: `min(60 * 2^attempts, 86_400)`; 120 s at attempt 1, 240 s at attempt 2, capped at the 24-hour Queues maximum.
- `queue(batch, env)`: the consumer. Never throws.

## Internals

- `codeOf(e)`: the error code that may be logged or stored: `ProviderError.code`, `NonRetryableError.code`, or an own `snake_case` token message; anything else becomes `internal`, so vendor or Postgres text never reaches logs.
- `log(level, job, attempt, errorCode)`: one JSON line with the allowlisted fields `job`, `attempt`, `error_code` only.
- `runWebhook(env, ref)`: loads the ledger row (missing: `NonRetryableError('event_missing')`); `done`, `ignored`, `dead` rows return at once (idempotent replay); marks `processing`; resolves the target with `connectionIdForWebhook`:
  - `null`: marks `ignored` with `no_connection`;
  - `'unmatched_payroll'`: reconciles every non-terminal payroll connection (up to 20), so the first Truv task events of a new order are not lost;
  - an id: `reconcileConnection(env, id, { source: 'webhook', hint: payload })`, then stamps `last_webhook_at`;
  then marks the row `done`.
- `runJob(env, job)`: `webhook` → `runWebhook`; `reconcile` → `reconcileConnection(..., { source: 'cron' })`; `remove_item` → `NonRetryableError('job_not_available')` until Plan 04; unknown → `NonRetryableError('unknown_job')`.

## `queue(batch, env)`

- DLQ batch (`batch.queue === 'resspark-jobs-dlq'`): a `webhook` message marks its ledger row `dead` with `dead_lettered`; any other job writes `job.dead_lettered` on its connection. Every message is acked; a failed record is logged as `dlq_record_failed`.
- A DLQ `logics_push` message is acked with no record: its ledger row is still `queued` and the Phase 5 sweeper re-enqueues it.
- Main queue, `logics_push` messages: handed whole to `handleLogicsPushPart(m, env)` (`jobs/logics-push.ts`) and skipped by the generic wrapper below. That handler owns `ack` and `retry` (ack-after-dispatch, Phase 5 D-03), so the generic transient retry can never redeliver a document POST. A throw from the handler (a database error) is only logged (`error_code` via `codeOf`) and never turned into a retry: a message the handler did not ack or retry is implicitly acked when `queue()` returns, and a row it left `sending` is moved to `unknown` (`consumer_lost`) by the sweeper.
- Main queue, every other message: `runJob`, then `ack()`. On a transient `ProviderError` (network, 429, 5xx): `retry({ delaySeconds: retryDelaySeconds(attempts) })`; after `max_retries` the platform moves the message to the DLQ. On anything else: log, mark the ledger row `dead` with the code (webhook) or write `job.failed` on the connection (other jobs), then `ack()`, so a poison message never loops.

## Tests

`jobs/index.test.ts` (unit, mocked `db/*` and `./reconcile`): ack on success with `processing` then `done`; retry delays 120 / 240 / 86400; non-retryable marks `dead` and acks; `reconcile` failure writes `job.failed`; already-`done` events skip reconcile; `unmatched_payroll` reconciles each listed connection; DLQ handling for webhook and reconcile bodies; unknown type acks without throwing. `connections-tracer.test.ts` proves the success path live.
