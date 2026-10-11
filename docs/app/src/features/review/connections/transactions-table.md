# `app/src/features/review/connections/transactions-table.tsx`

The `Transactions` disclosure on a bank connection card (Plan 04-06; BANK-02). It follows the UI-SPEC dense admin table rules: 14 px text, 40 px rows, a sticky header, right-aligned `tabular-nums` money, and relative dates with the ISO date in `title`.

| Part | What it does |
|------|--------------|
| `humanize(category)` | Plaid's `FOOD_AND_DRINK` → `Food and drink`; `null` → `—`. |
| `WINDOWS` | The two window buttons: `Last 6 months` (the default) and `Last 3 months`. |
| `TransactionsTable({ connectionId })` | A `Collapsible`, closed by default, with a ghost `Transactions` trigger (the chevron rotates when open). Inside are the two window buttons (`variant="outline"`, `aria-pressed`, the pressed one tinted `bg-accent`) and `Rows`. `ToggleGroup` is not vendored in this app, so two buttons stand in for it. `Rows` mounts only while the disclosure is open, so a closed card fetches nothing. |
| `Rows({ connectionId, months })` | Calls `useTransactions(connectionId, months, true)`. Error: the generic staff sentence plus the code in muted text. Loading: three `Skeleton` rows. Empty: `No transactions yet`. Otherwise a table inside a `max-h-96` scroll box. The box overrides the shadcn container's own overflow so the `sticky top-0` header sticks to the box. |
| Columns | Date (`ago(date)`, `title` = ISO date) · Description (`merchant_name ?? name`, plus a `Pending` `StatusBadge` when `pending`) · Category (humanized) · Amount (`formatMoney(amount, iso_currency_code)`, `text-end tabular-nums`). Rows keep the server order (newest first). |
| Footer | `Showing {rows} of {total}`. `total` counts every row in the window; the Worker sends at most 1000. |

Shortcut: there is no paging. The server caps the list at 1000 rows; add paging when a real case exceeds that.
