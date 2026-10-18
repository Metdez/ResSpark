# `app/worker/src/jobs/payroll-reconcile.test.ts`

Unit tests for the PAY-04 rules in `payroll-reconcile.ts`. `db/connections` is auto-mocked (`setConnectionStatus` echoes the requested status); `getOrder`, `getIncomeReport`, `getLinkDocuments`, `truvDownload` and `storeProviderFile` are mocked while the pure helpers (`summarizeEmployers`, `mapOrderStatus`, `collectEmployerFiles`, `employerSlug`) stay real.

1. An expired order with a pending employer: status `error` with `{ code: 'order_expired' }`, and no income report is read.
2. One employer `error`, one `completed`: only the completed employer's report is read (`link_ok`), the connection ends `done`, and the saved `data.employers` keeps `e1` as `error` and gives `e2` `fetched_at` and counts of 0 (its report has no files, so nothing is stored).
3. One `completed` employer whose report has one statement (`2026-09-15`, check `1001`): `storeProviderFile` is called once with `kind payroll`, `group good-co-e2`, `name paystub-2026-09-15-1001.pdf`, `displayName Pay stub - September 15, 2026 - check 1001.pdf` and `document_type pay_stub`.
