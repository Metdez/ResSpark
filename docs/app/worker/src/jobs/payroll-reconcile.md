# `app/worker/src/jobs/payroll-reconcile.ts`

`reconcilePayroll(env, conn, opts)`: the payroll branch of `reconcileConnection` (D-03, PAY-04).

1. No `external_id` yet (the Truv order was never created): returns the current status, `applied: false`, no vendor call.
2. `getOrder(env, external_id)`: `GET https://prod.truv.com/v1/orders/{id}/`, the authoritative read. The webhook payload is never used for status.
3. `summarizeEmployers(order, previous)`: per-employer summary keyed by `employer_id`, keeping fetch bookkeeping (`fetched_at`, counts) from earlier runs. `previous` is `conn.data.employers` when it is an array.
4. `updateConnection` writes `data.employers` and `data.order_expired_at` (other `data` keys are kept).
5. `mapOrderStatus(order)` → `setConnectionStatus(env, id, status, code ? { code } : {}, opts.actorId)`; returns the RPC's `status` and `applied`.

Plan 03 inserts the per-employer income report and pay stub / W-2 download between steps 4 and 5. No value reaches `case_financial_data` or the engine.
