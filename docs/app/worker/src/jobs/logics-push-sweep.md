# `app/worker/src/jobs/logics-push-sweep.ts`

The Logics push ledger's backstop for a lost consumer (D-03, Pitfall 3, PUSH-04). `scheduled()` in `cron.ts` calls it on every Cron Trigger.

## `logicsPushSweep(env)`

1. `rpc('logics_push_sweep')` with the SQL defaults (`p_stale_minutes 10`, `p_orphan_minutes 5`, migration 0006). In one statement it moves every `sending` row claimed over 10 minutes ago to `unknown` with `error_code 'consumer_lost'` (staff then mark it sent or re-send it) and logs `logics.push_unknown` per row. It returns `{ swept, requeue }`, where `requeue` lists `queued` rows idle over 5 minutes (a lost queue message, or a sibling part whose send failed).
2. One `env.JOBS.send({ type: 'logics_push', provider: 'logics', ref })` per id in `requeue`.
3. Returns `{ swept, requeued }`.

An RPC error throws `logics_sweep_failed`; the cron `step` wrapper logs it and continues with the other steps.

## Why re-enqueue cannot double-send

Only `queued` rows are re-enqueued. `logics_push_claim` is state-guarded: a duplicate message for a row that is already `sending`, `sent`, `failed` or `unknown` is refused, and the consumer acks it. `sending` rows are never re-enqueued; they become `unknown`, because the POST may have reached Logics. A dead-lettered `logics_push` message is acked by the DLQ branch of `jobs/index.ts` without touching the ledger; the row is still `queued` (or terminal) and this sweeper picks it up.

## Tests

`logics-push-sweep.test.ts` (see its companion doc).
