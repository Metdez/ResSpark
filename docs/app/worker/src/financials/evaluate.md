# `app/worker/src/financials/evaluate.ts`

Orchestrates one evaluation (D-15, FORM-05). It reads `case_financial_data`, fetches the county's standards once, runs the TypeScript engine and records the result as one immutable `determination_runs` row. It does no IRS math itself. Every amount, path, reason and label comes from `app/worker/src/engine/` (D-01, CLAUDE.md).

| Part | What it does |
|------|--------------|
| `RunView` | The run as the API returns it. It holds the `path` and `reason` verbatim, the short `outcome` label from `outcome.ts` (or `null` for an unmapped path), and `next`, which is always `NEXT_STEP`: "A tax professional must review this result before anything is filed." It also holds Box D/E/F (`monthly_income`, `monthly_expenses`, `net_disposable_income`), equity, the suggested offer or payment, the review flags, the allowable breakdown, the seven NRE lines with labels, the standards inputs and effective date, the engine version, `payment_math` and the creator's name. |
| `EvaluationResponse` | One of three outcomes: `determination` (with a run), `information_needed` (missing columns with labels, plus the review flags), or `standards_unavailable` (fixed message). The last two carry no amounts (T-07-17). |
| `UNAVAILABLE` | The fixed `standards_unavailable` response. |
| `PAYMENT_OUTCOMES` | `simple_plan` and `non_simple_installment`. These are the outcomes whose payment comes from the balance divided by the CSED months. |
| `evaluateForCase(env, p)` | The steps are listed below. It returns `null` when the case does not belong to the firm, and the route turns that into a 404. |
| `toRunView(row, createdByName)` | Maps a stored row to `RunView`. Numeric columns go through `Number()`. `payment_math` is built only for the payment outcomes, from the snapshot's `total_tax_owed` and `pyMax(csed_months_remaining, 1)`. That is the same clamp `resolution-path.ts` applies, so staff see the exact divisor. |

## `evaluateForCase` steps

1. `getCaseForFinancials`, filtered by firm. If the row is absent, it counts as empty, so every fact is missing.
2. **Missing facts block.** This step runs if any required column is NULL, or if an applicable question is unanswered. `evaluateCase(row, null)` returns `information_needed` before it needs a repository. The missing list is the question ids followed by the columns, de-duplicated in first-occurrence order (as in Python's `result_for_row`), each with its `labelFor` label. Nothing is written. Unknown values are never zero-filled. Python's `case_api._screenable` zero-fill is deliberately not ported (07-01-SUMMARY).
3. `fetchStandardsBundle` runs once, with the row's state, county, household size and vehicle count. `isStandardsBundle` guards the result, and a malformed bundle throws, which gives a 500.
4. `evaluateCase(row, new BundleStandardsRepository(bundle))`. If it throws `StandardsLookupError` (a null standard, or arguments that do not match the bundle), the response is `standards_unavailable` and nothing is written. Any other error is rethrown.
5. The allowable breakdown (`calculateAllowableExpenses`) and the NRE lines (`netRealizableEquityLines`) come from the engine with the same repository. NRE lines are stored as `[{ key, label, value }]` in `NRE_LINE_KEYS` order.
6. `insertDeterminationRun` writes these fields:
   - `status`, `path`, `reason`, the five amounts and `needs_manual_review`;
   - `review_notes`, which holds the workflow's review flags, including the determination's notes;
   - `financial_data_snapshot`, which holds the row;
   - `firm_id` and `created_by`;
   - `allowable_breakdown`, `nre_lines` and `standards_inputs` (the bundle);
   - `standards_effective_date`, taken from `standards_versions`;
   - `engine_version` (`ENGINE_VERSION`).

   The engine's `calculation_trace` is not stored, because the table has no column for it.
7. Logs `evaluation.created` with `{ run_id, status, outcome_id }` only (D-20).

## Tests

- `app/worker/test/financials-api.test.ts` (live): the determination path matches a test-side `evaluateCase` run on the same bundle. Missing facts and an unknown county write no run.
