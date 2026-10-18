# `app/worker/src/jobs/payroll-reconcile.ts`

`reconcilePayroll(env, conn, opts)`: the payroll branch of `reconcileConnection` (D-03, D-06, PAY-02, PAY-04).

## Steps

1. No `external_id` yet (the Truv order was never created): returns the current status, `applied: false`, no vendor call.
2. `getOrder(env, external_id)`: `GET https://prod.truv.com/v1/orders/{id}/`, the authoritative read. The webhook payload is never used for status.
3. `summarizeEmployers(order, previous)`: per-employer summary keyed by `employer_id`, keeping fetch bookkeeping (`fetched_at`, counts, `report`) from earlier runs. `previous` is `conn.data.employers` when it is an array.
4. `updateConnection` writes `data.employers` and `data.order_expired_at` (other `data` keys are kept).
5. `mapOrderStatus(order)` gives the status and code.
6. **Per-employer fetch.** Skipped entirely when the order is expired with work outstanding (`is_expired` and code `order_expired`): no report is read. Otherwise, for each order employer whose Truv status is `completed`, that has a `link_id`, and whose summary has no `fetched_at`, `fetchEmployerFiles` runs and its result is merged into the summary; `data` is saved after each employer, so a crash mid-order keeps the employers already finished. Employers in `error` (a `login_error` task, for example) or still in progress are skipped; their status is already in the summary.
7. `setConnectionStatus(env, id, status, code ? { code } : {}, opts.actorId)`; returns the RPC's `status` and `applied`. `done` moves the item to `submitted` inside the RPC.

## `fetchEmployerFiles(env, conn, emp, linkId)`

1. `getIncomeReport` and `getLinkDocuments` in parallel (each once per employer).
2. `collectEmployerFiles(report, docs)` gives the file list (see `reports.md` for names).
3. `group = employerSlug(company_name, employer_id)`, so two employers with the same name land in different folders.
4. For each file, `storeProviderFile` with `name` (the storage key), `displayName` (the human-readable `original_filename`, see `reports.md`) and a lazy loader: the loader runs only when the path is not stored yet. It downloads (`truvDownload`) and, when Truv sent an `md5sum`, compares `md5Hex(bytes)`; a mismatch throws `ProviderError('truv', null, 'file_hash_mismatch', true)` (transient, so the queue retries with a fresh download) and nothing is stored for that file. Every collected file is counted, whether stored now or already present.
5. `connection.documents_fetched` event with `{ employer_id, pay_stubs, w2s, income_reports }`.
6. Returns the counts, `fetched_at` (now) and `report: stripFileUrls(report)`: the report figures without vendor URLs or the report's `access_token`.

## Idempotency

- `fetched_at` on an employer stops a rerun from reading its report again; a rerun of a `done` connection makes exactly one vendor call (`GET` order).
- `documents.storage_key` is unique and checked before download, so a rerun after a crash downloads only files not yet stored.
- A client's manual upload to the same item uses the Phase 3 path `.../item/<item>/<document_id>/<name>`, never `.../payroll/...`, so the two writers cannot collide.

No value reaches `case_financial_data` or the engine.

## Tests

- `app/worker/test/payroll-fetch.test.ts` (live): two employers, six documents, rerun, md5 mismatch.
- `app/worker/src/jobs/payroll-reconcile.test.ts` (unit): expired order fetches nothing; an `error` employer next to a `completed` one; a completed employer with one statement calls `storeProviderFile` with `name paystub-2026-09-15-1001.pdf` and `displayName Pay stub - September 15, 2026 - check 1001.pdf`.
