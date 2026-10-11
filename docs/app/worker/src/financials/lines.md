# `app/worker/src/financials/lines.ts`

This file holds static metadata for every 433-A line in the staff view (D-14). The SPA worksheet (Plan 06), the staff view (Plan 09) and the proposers (Plans 05 and 07) read these labels and keys from here, so no other module has to repeat them. It holds no amounts, no Plaid or Truv categories, and no deduction names.

Line numbers come from Form 433-A Rev. 6-2026, as listed in `.planning/research/FEATURES.md` §(f). Labels are plain-English versions of the field comments in `src/financial_data.py`.

| Part | What it does |
|------|--------------|
| `SectionId` | The seven sections, in display order: household, employment, income, expenses, assets, compliance, liability. |
| `LineKind` | How the UI should render and parse a value: `money`, `count` (integer), `bool`, `text`, or `money_list` (the per-vehicle arrays). |
| `NaRule` | When staff may mark a line "Not applicable". `not_married` applies to the joint offer and spouse age, `owns_home` to renting, and `not_wage_earner` to pay frequency. This is a UI hint only. The value is written only through an explicit `not_applicable` decide action (D-06). |
| `StandardKey` | The `StandardsBundle` value that caps or replaces the line: `national`, `housing`, `ownership`, `operating`, or `health`. |
| `LineMeta` | One line. It has `column` (the `case_financial_data` column, or `null` for a line that is always the standard), section, form line, label, kind, `required`, `na_rule`, and optionally `allowable_key` (its key in the engine's allowable breakdown) and `standard_key`. |
| `SECTIONS` | Section ids and titles, in order. |
| `REQUIRED` | The set of columns that block evaluation. It is the engine's `REQUIRED_FINANCIAL_COLUMNS` plus every intake question id except `tax_only_balance`, which is the set `missing_question_ids` skips. With 58 required columns and 5 question-only columns (`pay_frequency` and the four `has_*` flags), that makes 63. |
| `l(...)` | Builds a column line. `required` is derived from `REQUIRED`, so it can never drift from the engine. |
| `standardOnly(...)` | Builds the two expense lines that are always the IRS standard: line 36 (food, clothing and miscellaneous, `national`) and line 42 (out-of-pocket health care, `health`). Their `column` is `null` and they are not required. |
| `LINES` | Every line, grouped by section in display order. Expense lines carry their `allowable_key`. Housing, vehicle ownership and vehicle operating also carry the `standard_key` that caps them. `oic_payment_months` and `ai_flags` are not 433-A lines and are left out. |
| `BY_COLUMN` | Lookup from column name to line. |
| `lineFor(column)` | The line for a column, or `undefined`. The decide route uses it to validate `:column` before calling the RPC (T-07-16). |
| `labelFor(column)` | The line's label. It falls back to the column name. Used for "Information still needed" lists. |
