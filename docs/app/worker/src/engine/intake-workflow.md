# `app/worker/src/engine/intake-workflow.ts`

Port of the evaluation half of `src/intake_workflow.py`: which facts are still missing, which documents to request, which review flags apply, and `evaluateCase`, the single entry point the Worker calls. The question declarations and answer validation live in `app/shared/questions.ts` (shared with the SPA).

## Parts

| Part | Python source | What it does |
|------|---------------|--------------|
| `missingFinancialColumns` | `missing_financial_columns` | Re-exported from `financial-data.ts` (defined there to avoid a circular import with `financialDataFromCaseRow`). |
| `DocumentRequest` | `@dataclass(frozen=True) DocumentRequest` | `code`, `title`, `reason`, `required`. |
| `DOCUMENT_REQUESTS` | `_REQUESTS` | The 12 requests, wording verbatim. `housing_utilities` is the only optional one. `request()` is a small constructor with Python's `required=True` default. |
| `missingQuestionIds(row)` | `missing_question_ids` | Every question id except `tax_only_balance` whose row value is `None` (`== null`), sorted with the default sort (ASCII ids, same as Python `sorted`). Includes the five question-only columns (`pay_frequency` and the four `has_*` flags). |
| `documentRequestsFor(row)` | `document_requests_for` | Starts with transcripts and bank statements, then adds codes using **Python truthiness** of the row values (`if case_row.get(x)` → `if (row.x)`), `is True`/`is False` checks as `=== true`/`=== false`, and `(vehicle_count or 0) > 0`. Dedupes keeping first occurrence (`dict.fromkeys` → `new Set`). |
| `FLAG_LABELS`, `reviewFlags(row)` | `_review_flags` | Labels for prior bankruptcy, litigation, prior default; only a value that `=== true` raises a flag. |
| `WorkflowResult` | `WorkflowResult` | `status`, missing ids and fields, review flags, document requests, determination. Python's `initial_questions` is not carried: the SPA reads `INITIAL_QUESTION_IDS` from the shared module. |
| `evaluateCase(row, repo)` | `evaluate_case` | Applicable missing questions (`isApplicable`) or missing financial columns → `information_needed` with no determination (no standards call is made). A complete case with `repo == null` throws Python's message `A database-backed standards repository is required for a complete case.` Otherwise runs `determineResolutionPath` (from `resolution-path.ts`); status is `blocked` when the path starts with `BLOCKED`, `ready_for_review` when there are flags or the determination needs manual review, else `ready`. `review_flags` = flags followed by the determination's review notes. |

## Tests

`parity.test.ts` runs every `golden.json` case through `evaluateCase` with a replay repository and asserts `toEqual` on the whole result plus an empty replay queue.
