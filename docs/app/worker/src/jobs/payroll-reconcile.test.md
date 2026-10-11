# `app/worker/src/jobs/payroll-reconcile.test.ts`

Unit tests for the PAY-04 rules in `payroll-reconcile.ts`. `db/connections` is auto-mocked (`setConnectionStatus` echoes the requested status); `getOrder`, `getIncomeReport`, `getLinkDocuments`, `truvDownload` and `storeProviderFile` are mocked while the pure helpers (`summarizeEmployers`, `mapOrderStatus`, `collectEmployerFiles`, `employerSlug`) stay real.

1. An expired order with a pending employer: status `error` with `{ code: 'order_expired' }`, and no income report is read.
2. One employer `error`, one `completed`: only the completed employer's report is read (`link_ok`), the connection ends `done`, and the saved `data.employers` keeps `e1` as `error` and gives `e2` `fetched_at` and counts of 0 (its report has no files, so nothing is stored).
