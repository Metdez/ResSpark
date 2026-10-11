# `app/worker/src/financials/propose/bank.ts`

The `plaid` proposer (D-09; 07-RESEARCH Pattern 5 and Pitfall 8; FORM-03, FORM-07). It proposes monthly 433-A averages from connected bank transactions and cash on hand from stored balances.

Two rules shape it:

- **No category strings in TypeScript.** Which Plaid category feeds which 433-A column, and whether it is income, expense, excluded or informational, lives in `plaid_category_map` rows. The summing happens in SQL in `financial_bank_monthly` (migration 0008), so transactions are never read into the Worker. That also avoids PostgREST row caps. The category-guard test in `bank.test.ts` enforces this rule for every source file under `financials/`.
- **Never from partial or missing data.** If any connection's history is not complete, the source is skipped (`null`) and the previous `plaid` rows stay. A column with no transactions gets no proposal. It is never proposed as 0.

## Parts

| Part | What it does |
|------|--------------|
| `HISTORY_COMPLETE` | `HISTORICAL_UPDATE_COMPLETE` (Plaid's raw value, which bank-reconcile stores today) or `historical` (the mapped provider status). Both are accepted. |
| `MonthlyRow` | One `financial_bank_monthly` row: column, treatment, reliability, month, `amount_cents` (BIGINT, so it may arrive as a string) and `txn_count`. |
| `AccountRow` | The `bank_accounts` fields used for refs and cash. |
| `weaker(a, b)` | The weaker reliability (`A` < `B` < `C`). |
| `proposeBank(ctx)` | The proposer (steps below). |

## Steps

1. Load the case's bank connections (`kind = 'bank'`, status `connected`, `syncing` or `done`, scoped by firm and case). None gives `{ source: 'plaid', proposals: [] }`, which supersedes old rows.
2. **Readiness gate (T-07-30).** For every connection, `data.transactions_update_status` must be in `HISTORY_COMPLETE`. Its earliest `bank_transactions.date` (one ordered `limit(1)` read per connection) must also be on or before `ctx.window.start`. If either check fails, the result is `null`.
3. Load the connections' accounts. Every proposal's refs are `{ kind: 'bank_account', id, label: '<name> ••<mask>' }`.
4. Call `rpc('financial_bank_monthly', { p_firm_id, p_case_id, p_window_start, p_window_end })`. The SQL counts only non-pending transactions inside the window whose category maps to a column. Outflows count for expenses and inflows for income. Transfers, loan disbursements, card payments and tax refunds are `exclude` rows and never appear.
5. Keep only `income` and `expense` rows. `informational` rows, such as net salary deposits, are a cross-check only and never become wages (D-09, T-07-32). Group them by column, summing cents and transaction counts and keeping the weakest reliability.
6. For each column with at least one transaction, the value is `divHalfUp(total cents, window.months)` as a number. The method is `sum_outflows_<N>mo_div_<N>` (expense) or `sum_inflows_<N>mo_div_<N>` (income), and the proposal carries the window dates.
7. **Cash.** When the case has at least one `depository` account and every one of them has a stored `balance_current`, `cash_and_bank_balances` is their exact sum (via `toCents`). The method is `sum_depository_balance_current`, the reliability is A, there is no window (a balance is a point in time), and the refs are those accounts. If any depository balance is missing, no cash proposal is made.

Database errors throw the tokens `bank_lookup_failed` and `bank_monthly_failed`. No amounts or names are logged (T-07-31).

## Example

A 3-month window (Jul-Sep 2026) holding $1,500 of rent in each month gives `actual_housing_utilities` = 1500 with method `sum_outflows_3mo_div_3`. With a 6-month window (Apr-Sep), the same transactions give 750 (`sum_outflows_6mo_div_6`), as long as history reaches back to April.
