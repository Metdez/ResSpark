# `app/worker/src/cron.test.ts`

Unit tests for `cron.ts`. These modules are mocked: `./db/connections-ops`, `./db/connections`, `./db/webhook-events` (`defaultFirmId` returns `'F1'`), and `./db/events` (`logEvent`). `env.JOBS` is `{ send, sendBatch }`, both mocks.

| Test | Proves |
|------|--------|
| re-enqueues stuck webhooks first | One `sendBatch` call with the webhook job before the two reconcile jobs. Counts are `{ requeued: 1, reconciles: 2, expired: 0 }`. |
| sends nothing | Empty lists send nothing. |
| expires a dead Hosted Link session | `setConnectionStatus(env, 'C9', 'error', { code: 'link_expired' })` is called. |
| keeps going when one step throws | When `listStaleConnections` rejects, the expiry step still runs and the function still resolves. |
| chunks of 100 | 150 jobs go out as one batch of 100 and one of 50. |
| dailyJobs: dispatches / no-op / swallows | Due Items get `remove_item` jobs. Nothing is sent when nothing is due. A failed query resolves to `{ removals: 0 }`. |
| scheduled branches | `0 3 * * *` runs only the daily step and logs `cron.daily` with the counts. `*/15 * * * *` runs only the reconciler and logs `cron.tick`. |
| logs only allowlisted fields | The console line has exactly `route`, `status`, and `duration_ms`. |
