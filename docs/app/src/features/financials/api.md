# `app/src/features/financials/api.ts`

Typed client for the staff 433-A routes (Plans 07-04 to 07-06). Every response passes a guard before the UI sees it; no response JSON is cast to a type (T-07-39).

## Types

They mirror the Worker modules; keep them in sync when those change.

| Type | Mirrors |
|------|---------|
| `LineKind`, `LineStatus`, `DecideAction`, `CountyStatus` | String unions from `worker/src/financials/lines.ts`, `view.ts`, `rpc.ts`, `county.ts`. |
| `ProposalView`, `LineView`, `FinancialsView` | `worker/src/financials/view.ts`. `LineView.column` is `null` for the two expense lines whose allowed amount is always the IRS standard (lines 36 and 42). |
| `CountyBlock` | `worker/src/financials/county.ts`. |
| `Employer` | `CaseEmployer` from `worker/src/financials/db.ts` plus the `person` the view adds. |
| `RunView`, `EvaluationResponse` | `worker/src/financials/evaluate.ts`. `standards_inputs` is kept as a plain record; the UI reads single keys from it. |
| `WorksheetExport` | The export result in `worker/src/worksheet/store.ts`. |
| `BankTxnView`, `EvidenceView` | `worker/src/financials/evidence.ts` (Plan 10): one variant per evidence kind, discriminated by `kind`. |

## Guards

| Guard | Checks |
|-------|--------|
| `isProposal` (private) | id, source, method, created_at are strings; `source_refs` is an array. |
| `isLine` (private) | column and line are string or null; section and label are strings; kind and status are known values; required is boolean; confirmed is null or an object; every proposal passes `isProposal`. |
| `isCounty`, `isEmployer` (private) | A known county status; an employer id string, a company name string or null, and person `taxpayer` or `spouse`. |
| `isFinancialsView` | Case id, settings with a string array of spouse employer ids, the window (start, end, months 3 or 6), the county block, employers, the required counts, and sections whose lines all pass `isLine`. A body without `sections` fails, so `api()` throws `ApiError(500, 'invalid_response')`. |
| `isRunView` (private) | id, path, reason and next are strings; the five amounts are finite numbers; flags are strings; NRE lines have a key, a label and a numeric value; `standards_inputs` is an object; `payment_math` is null or two numbers. |
| `isEvaluationResponse` | `determination` needs a valid run; the other two outcomes need `run: null`; `information_needed` needs labelled missing items and string flags. |
| `isEvidenceView` | A string `column` and `label`; `kind: 'none'` needs nothing else; every other kind needs a `proposal_id` string and its own fields (see the per-kind checks in the code: `bank` needs the window, months with numeric subtotals and transactions with id, date, numeric amount and account label, a numeric average, a boolean `truncated` and a `cross_check` that is `null` or a label and a number). An unknown kind fails. |
| `isLatest`, `isDecided`, `isQueued`, `isWorksheetExport` (private) | The shapes of the latest-run, decide, refresh (202) and export responses. |

## Functions

All go through `api()` from `lib/api.ts` (Bearer staff token, `{ error: { code, message } }` envelope to `ApiError`). Ids are URI-encoded; values travel only in JSON bodies (T-07-40). `base(caseId)` builds `/api/admin/cases/:id`; `post(body)` builds a POST init with a JSON body.

| Function | Request |
|----------|---------|
| `getFinancials(caseId)` | `GET /api/admin/cases/:id/financials` |
| `decide(caseId, column, body)` | `POST /api/admin/cases/:id/financials/:column/decide` with `{ action, proposal_id?, value?, note? }` |
| `refreshProposals(caseId, body?)` | `POST /api/admin/cases/:id/financials/refresh` with `{ window_months?, spouse_employer_ids? }` (default `{}`) |
| `runEvaluation(caseId)` | `POST /api/admin/cases/:id/evaluations` |
| `latestEvaluation(caseId)` | `GET /api/admin/cases/:id/evaluations/latest` |
| `exportWorksheet(caseId, runId)` | `POST /api/admin/cases/:id/evaluations/:runId/worksheet` |
| `getEvidence(caseId, column, proposalId?)` | `GET /api/admin/cases/:id/financials/:column/evidence`, with `?proposal_id=` only when a proposal id is given |

## Tests

`api.test.ts` (`web` project; `fetch` stubbed, `@/lib/supabase` mocked): the view GET path; a body without `sections` rejects with `invalid_response`; `decide` POSTs the action body to the column route; the evaluation guard accepts the three outcomes and rejects a determination without a run; the view guard rejects an unknown line kind.
