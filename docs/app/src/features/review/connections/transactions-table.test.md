# `app/src/features/review/connections/transactions-table.test.tsx`

Vitest (`web` project, jsdom) for `transactions-table.tsx`. `fetchTransactions` is mocked; a `tx(over)` builder makes a settled `$12.34` Starbucks `FOOD_AND_DRINK_COFFEE` row, and `ROWS` adds a pending `−$1,500` payroll deposit. `renderOpen()` mounts the table in a `QueryClientProvider` and clicks the `Transactions` trigger.

| Test | Asserts |
|------|---------|
| fetches nothing while closed | A mounted, closed disclosure never calls `fetchTransactions`. |
| defaults to Last 6 months | `Last 6 months` is `aria-pressed`, the fetch asks for 6. |
| switching windows | Clicking `Last 3 months` fetches 3 and moves `aria-pressed`. |
| row rendering | Rows keep server order; description, humanized category (`Food and drink`) and the ISO date in `title`. |
| money | `−$12.34` and `+$1,500.00`, right-aligned with `tabular-nums`. |
| pending chip and footer | `Pending` only on the pending row; `Showing 2 of 412`. |
| spending summary | With a rent charge and an `INCOME_WAGES` deposit added, the `[data-spending-summary]` block reads `Spending by category · last 6 months`, lists `income`, `Rent`, `Food and drink` in that order, the Rent line shows `1 · $1,500.00 · $250.00`, and the footnote says `Settled transactions only.` without the partial-window clause (rows equal total). |
| summary hidden | Only the pending deposit → no `[data-spending-summary]`. |
| loading | Three `[data-skeleton]` rows while the promise is open. |
| empty | `No transactions yet` for zero rows. |
