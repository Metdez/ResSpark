# `app/worker/src/jobs/bank-transaction-pdfs.test.ts`

Unit tests of `generateTransactionPdfs` in the `worker-node` project. `../db/bank` is auto-mocked, `storeProviderFile` and `renderTransactionStatement` are `vi.fn()` over the real modules (the payroll-reconcile mocking style). `now` is pinned to 2026-10-10, so the window is Sep 2026 back to Apr 2026. One account `A1` (`Checking`, mask `1234`) is the default; `storeProviderFile` returns `DOC1`.

| Test | Checks |
|------|--------|
| skips | A `not_supported` cell that already has a document, `available`, `manual` and `pending` cells, and a `missing` March 2026 cell (outside the window) all produce no transaction lookup, no store and no cell write; the result is `{ generated: 0 }`. |
| empty months | A month with no rows and a month with only a pending row store nothing. |
| stores and attaches | Two fallback months (`not_supported` Sep, `missing` Jul) give `{ generated: 2 }`. The first store call carries `kind: 'bank'`, `group: '1234'`, `name: '2026-09-transactions.pdf'`, `displayName: 'Transactions - September 2026 - x1234.pdf'`, `mime: 'application/pdf'`, `document_type: 'bank_transactions'`, `actor: 'provider:resspark'`; its `bytes` loader returns an `ArrayBuffer` starting with `%PDF-` and renders only the settled row with the account's name and mask. The second call names July. `setMonthCell` is called with the **unchanged** status (`not_supported`, `missing`) and `DOC1`. |
| no mask | An account without a mask groups by `external_account_id` (`ext-2`) and the display name has no ` - x…` suffix; the render receives `accountName: null, mask: null`. |
