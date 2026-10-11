# `app/worker/src/jobs/reconcile.test.ts`

Unit tests for the connection-done trigger in `reconcileConnection` (Plan 07-07, D-07). `db/connections` and the three kind branches (`bank-reconcile`, `payroll-reconcile`, `signature-reconcile`) are mocked. `env.JOBS.send` is a `vi.fn`.

| Test | Expectation |
|------|-------------|
| payroll / bank reaching done (applied) | Exactly one `send({ type: 'financials_propose', ref: 'CASE1', reason: 'connection_done' })`, the result is passed through, and `last_polled_at` is still stamped. |
| done but not applied | No send (an equal-status no-op). |
| connected | No send. |
| signature done | No send: e-sign carries no financial data. |
| throwing `JOBS.send` | `connection.enqueue_failed { reason: 'connection_done' }` is recorded with a system actor. Even when that record throws too, the reconcile still resolves with `{ status: 'done', applied: true }`. |
