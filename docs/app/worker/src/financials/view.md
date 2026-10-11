# `app/worker/src/financials/view.ts`

A pure function that builds the staff 433-A view (D-14, FORM-03/04) from the rows `db.ts` reads. It does no I/O and no math. The route calls it, and the unit tests can call it directly.

| Part | What it does |
|------|--------------|
| `ProposalView` | One competing proposal as the UI shows it: source, proposed value, method, window, reliability, evidence refs and creation time. |
| `LineStatus` | One of `needs_data`, `proposed`, `confirmed`, `edited`, or `standard`. |
| `LineView` | A `LineMeta` plus `value` (`null` = unknown), `status`, `confirmed` (who and what set the value), and every `proposed` row for the column, side by side. |
| `FinancialsView` | The response. It has the case header, `settings`, `window` (`completeMonthsWindow(now, settings.window_months)`), `county` (a `CountyBlock`, see `county.md`), `employers` (each `CaseEmployer` plus `person`: `spouse` when its id is in `settings.spouse_employer_ids`, otherwise `taxpayer`), `standards_version`, `required: { confirmed, total, missing }`, and the seven sections with their lines. |
| `toProposalView` | Maps a `ProposalRow` to a `ProposalView`. |
| `latestDecided` | Returns the newest `accepted` or `edited` row for a column, by `decided_at`. That is the decision that set the current value. |
| `lineView` | Applies the status rules (listed below). |
| `settingsOf` | Exported, because the propose job (`propose/run.ts`) reads the same settings. Reads `cases.financials_settings` with defaults. `window_months` is 6 only when it is exactly 6, and 3 otherwise. `spouse_employer_ids` keeps only string entries and defaults to `[]`. |
| `buildFinancialsView` | Takes the rows plus `county`, `employers` and `now` from the route. Groups proposals by column and computes `required`. It builds every line and groups the lines into `SECTIONS` order. |

## Status rules

| Condition | Status | `confirmed` |
|-----------|--------|-------------|
| Line has no column (lines 36 and 42) | `standard` | `null` |
| Value is null and at least one `proposed` row exists | `proposed` | `null` |
| Value is null and there are no proposals | `needs_data` | `null` |
| Value is set and the latest decided row is `edited` | `edited` | That row's id and source, the decider's name, and the time |
| Value is set otherwise | `confirmed` | As above. If no decided row exists (for example, a value seeded directly), every field is `null`. |

`proposals` always lists the column's open `proposed` rows, even when a value is already set, so staff can see a newer competing value.

## Required count

`missing` is the same blocking set `evaluateCase` uses:

- applicable unanswered questions (`missingQuestionIds` filtered by `isApplicable`, as in Python);
- plus every required column that is still NULL (`missingFinancialColumns`).

The two lists are de-duplicated and sorted. `total` is the number of `required` lines in `LINES`, which is 63. `confirmed` is the number of those lines whose column is not in `missing`. A missing or absent row counts every required line as missing.

## Tests

- `app/worker/src/financials/view.test.ts` (unit): the status rules, competing proposals, required counts, the window and the spouse marking.
- `app/worker/test/financials-api.test.ts` (live): `proposed` changes to `confirmed` after accept.
