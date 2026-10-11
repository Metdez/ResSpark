# `app/src/features/review/connections/transactions-table.test.tsx`

Component tests for `TransactionsTable`. `./api` `fetchTransactions` is mocked. Each test renders in a fresh `QueryClient`, and every test except the first opens the disclosure first (`renderOpen`).

| Test | Checks |
|------|--------|
| closed | No fetch while the disclosure is closed. |
| default window | `Last 6 months` has `aria-pressed="true"`, and `fetchTransactions('C1', 6)` is called. |
| switch | `Last 3 months` calls `fetchTransactions('C1', 3)` and becomes pressed. |
| row content | Server order; `merchant_name` with a fallback to `name`; `Food and drink`; the date `title` is the ISO date. |
| money | `−$12.34` and `+$1,500.00`, with `tabular-nums` and `text-end`. |
| pending and footer | `Pending` chip only on the pending row; `Showing 2 of 412`. |
| loading | Three skeleton rows. |
| empty | `No transactions yet`. |
