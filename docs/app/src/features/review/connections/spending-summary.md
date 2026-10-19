# `app/src/features/review/connections/spending-summary.ts`

Pure helpers behind the `Spending by category` block on a bank connection card (Oct 12 call: "here's everything that's rent, car payment, utilities… here's what the client's expenses are", quick task 261018-kgl). No DOM, no fetch; the table component in `transactions-table.tsx` calls it with the rows it already fetched.

| Part | What it does |
|------|--------------|
| `humanizeCategory(category)` | Plaid's `RENT_AND_UTILITIES` → `Rent and utilities`; `null` → `Uncategorized`. The transactions table reuses it for its Category column (with `—` for null). |
| `DETAILED` | Plaid v2 detailed categories a case manager reads first, mapped to 433-A words: Rent, Mortgage, Car payment, Utilities (gas and electricity, water, sewage, other), Phone, internet and cable (telephone, internet and cable), Insurance, Fuel, Student loan, Credit card payments. Any other detailed value groups under its humanized primary. |
| `groupLabel(row)` | `DETAILED[category_detailed]` when present, otherwise `humanizeCategory(category_primary)`. |
| `summarizeSpending(rows, months)` | Settled rows only (`pending` rows are skipped: a pending charge can still reverse). Outflows (`amount > 0`, Plaid sign) are grouped by `groupLabel` into `expenses` (`label`, `count`, `total`, `monthly = total / months`), sorted by total descending then label. Inflows with primary `INCOME` become one `income` group, `Income deposits`; other inflows (transfers in, refunds) are left out. Totals are rounded to cents. `currency` is the first row's `iso_currency_code`, or `null`. |

The allowable-standard comparison stays on the 433-A worksheet (`plaid_category_map` and the evaluation); this block is the quick read on the card, so the mapping here is display-only and never feeds a calculation.

## Tests

`spending-summary.test.ts`: humanized primaries; detailed labels (Rent, Car payment, Utilities for water, primary fallback for an unmapped detailed value, `undefined` detailed); grouping, sort order, per-month averages and cent rounding over a 3-month window; pending rows and non-income inflows skipped while income deposits total separately over 6 months; null currency and empty input.
