# `app/worker/src/financials/propose/payroll.ts`

The `truv` proposer (D-08, D-09, D-13; FORM-03, FORM-07). It turns the Truv income reports that the payroll reconcile stored on `connections.data.employers[].report` into monthly 433-A proposals: gross wages per person, payroll deductions, the wage-earner flag and the pay frequency.

The file holds no Truv deduction category. Which deduction lands on which 433-A line comes from the `truv_deduction_map` rows (seeded in `supabase/migrations/0009_433a_seed.sql`). A category-guard test in `bank.test.ts` reads every non-test file under `app/worker/src/financials/` to enforce this.

## Parts

| Part | What it does |
|------|--------------|
| `PERIODS`, `ANSWERS` | Truv pay-frequency codes. `W` 52, `BW` 26, `SM` 24, `M` 12 periods a year, and the intake answers `weekly`, `biweekly`, `semimonthly`, `monthly`. |
| `isCode(c)` | True only for an own key of `PERIODS`, so `toString` and other prototype names are rejected. |
| `periodsPerYear(code)` | Periods per year, or `null` for `A` (annual), `SA` (semiannual), `C` (contract) or a missing code. `null` means no wage proposal for that employment (RESEARCH Pitfall 9): an annual stub cannot be averaged into a month from a 3- or 6-month window. |
| `payFrequencyAnswer(code)` | The intake answer for a code, or `null`. |
| `likeToRegExp(pattern)` | SQL `ILIKE` as a JavaScript RegExp. `%` becomes `.*`, `_` becomes `.`, a backslash makes the next character literal, every other regex metacharacter is escaped. The result is anchored (`^...$`), case-insensitive and dot-all. |
| `DeductionMapRow` | The `truv_deduction_map` columns the proposer reads. |
| `PayrollConnection` | `{ id, data }` of a payroll connection row. |
| `arr`, `text`, `weaker` | Small readers: object items of an array; a trimmed non-empty string or `null`; the weaker of two reliabilities (`A` < `B` < `C`). |
| `Total`, `add` | Running cents, weakest reliability and refs per 433-A column. |
| `payrollProposals(conns, map, window, spouseEmployerIds)` | The pure calculation (below). `null` when no employer anywhere has a stored report (the source is skipped and old rows stay). `[]` when reports exist but nothing qualifies. |
| `proposePayroll(ctx)` | Loads the case's payroll connections (`kind = 'payroll'`, status not `removed`, scoped by firm and case). None gives `{ source: 'truv', proposals: [] }`, which supersedes old `truv` rows. Otherwise it loads `truv_deduction_map` ordered by `priority, id` and returns `{ source: 'truv', proposals }`, or `null` from the pure function. Database errors throw the tokens `payroll_lookup_failed` and `deduction_map_failed`. |

## The calculation

For every employer with a stored report, and every employment in it:

1. `periods = periodsPerYear(pay_frequency)`. `null` skips the employment.
2. Stubs are the statements whose `pay_date` (first 10 characters) is inside `[window.start, window.end]` (`ctx.window`: the last 3 or 6 complete calendar months). None skips the employment.
3. Every amount goes through `toCents`, which accepts at most two decimals. A malformed `gross_pay` or deduction amount skips the whole employment. Nothing is guessed.
4. Monthly figure: `divHalfUp(sumCents × periods, stubCount × 12)`. That is the mean per stub, times periods per year, divided by 12, in integer cents with half-up rounding.
5. The person: an employer whose `employer_id` is in `settings.spouse_employer_ids` goes to `gross_wages_spouse`, every other employer to `gross_wages_taxpayer`. Wages are summed per person across employments.
6. Each deduction is matched to the first map row (by priority) whose `truv_category` equals the deduction's `category` and whose `name_pattern` matches its `name`. Only `expense` rows with a column count. Their absolute cents are summed per column within the employment, converted with the same step 4 formula, and then summed across employments. A column's reliability is the weakest of the rows that contributed. `informational` rows (retirement, other benefits, memo) propose nothing.

### Proposals

| Column | Value | Method | Reliability |
|--------|-------|--------|-------------|
| `gross_wages_taxpayer`, `gross_wages_spouse` | monthly gross per person | `mean_gross_pay_x_periods_div_12` | A |
| each mapped deduction column (`actual_current_taxes`, `actual_court_ordered_payments`, `actual_health_insurance_premiums`, `actual_life_insurance_premiums`) | monthly deduction | `mean_deduction_x_periods_div_12` | from the map row |
| `is_wage_earner` | `true` when the taxpayer has wages | `truv_employment_with_stubs` | A |
| `pay_frequency` | the answer when all the taxpayer's wage employments share one code | `truv_pay_frequency` | A |

`is_wage_earner` and `pay_frequency` are intake questions about the taxpayer, so only taxpayer employments count. Every proposal carries `window_start` and `window_end`.

Refs are pay stubs: `{ kind: 'pay_stub', id: '<connection_id>:<employer_id>:<pay_date>[:<check_number>]', label: '<company> · <pay_date>' }`. A deduction's refs are the stubs that had that deduction, once each.

### Worked example (the test fixture)

Acme Inc (`BW`, three stubs of $2,650.00 in Jul-Sep 2026) and Beta LLC (`SM`, two stubs of $1,800.00):

- Acme wages: 265000 × 26 ÷ 12 = 574166.67, so 574167 cents. Beta: 180000 × 24 ÷ 12 = 360000. Both on the taxpayer: 9341.67.
- Beta as spouse: taxpayer 5741.67, spouse 3600.00, and `pay_frequency` = `biweekly`.
- Taxes: Acme 51273 × 3 × 26 ÷ 36 = 111091.5, so 111092; Beta 15000 × 2 × 24 ÷ 24 = 30000. Total 1410.92.

## Why bank salary deposits are not wages

A Plaid salary deposit is net pay: taxes, insurance and garnishments are already gone. Line 21-22 of the 433-A asks for gross wages. Wages therefore come only from Truv `gross_pay`. The Plaid salary categories are `informational` in `plaid_category_map` and stay a cross-check (D-09, threat T-07-32).
