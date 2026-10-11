# `app/worker/src/extract/merge.ts`

Port of `merge_documents`, `_sum_amounts`, `_sum_present`, `_apply_income` and `_covered_by_stub` in `src/document_parse.py`. Combines the parsed documents of one case into one row of `case_financial_data` columns. All money totals use exact decimal sums (`fields.ts`), so results equal Python's `Decimal` arithmetic.

| Part | What it does |
|------|--------------|
| `GROUPED` | Kinds that are collected and combined: bank, auto, pay_stub, wage, health, utility, retirement, life, investment. |
| `sumAmounts(items, key)` | Exact sum of `key` over the items that have it, as a float (`_sum_amounts`). |
| `sumPresent(row, items, key)` | Sets `row[key]` to that sum only when at least one item has the key (optional loan balances). |
| `orZero(value)` | Python `value or 0` as a decimal. |
| `coveredByStub(employer, employers)` | A W-2/wage transcript is skipped when a pay stub already covers it: never when there are no stub employers; always when the W-2 has no employer; otherwise when either name matches the other (`samePayer` both ways). |
| `applyIncome(row, stubs, wages)` | Employers are the non-empty stub `_employer`s. With no stubs and no wages nothing is set. Otherwise `gross_wages_taxpayer` is the sum of stub gross plus each uncovered wage transcript (an uncovered employer is appended to `employers` during the loop, so a later W-2 from the same payer is covered, as in Python). With stubs it also sets `actual_current_taxes` (missing taxes count as zero), `pay_frequency` when all stubs agree on one, and `is_wage_earner: true` when any stub says so. Returns the employers for the bank check. |
| `mergeDocuments(parts)` | Takes `_kind` off each part (the input objects are not mutated; Python's `pop` does mutate). Grouped kinds are collected; `bankruptcy` appends the review flag to `ai_flags`; any other kind (account, lease, mortgage, business, valuation) is copied onto the row, a later one overwriting an earlier one. Then, in Python's order: income, health premiums (sum), utilities (added to any lease/mortgage housing figure), retirement value and loan, life cash value and loan, investments, banks (`combineBanks`, which needs the employers), autos (`combineAutos`). A part without `_kind` is Python's `KeyError: '_kind'`. |
