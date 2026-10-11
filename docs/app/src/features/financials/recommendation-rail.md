# `app/src/features/financials/recommendation-rail.tsx`

`RecommendationRail({ caseId })`: the sticky right rail of the 433-A page (D-14, D-15, D-16, FORM-05, FORM-06 entry point). It shows the engine's recommendation and its math, runs the evaluation and exports the worksheet. Every number comes from the run the Worker returned; the rail computes nothing and invents no offer amount.

| Part | What it does |
|------|--------------|
| `REVIEW_NOTE` | `A tax professional must review this result before anything is filed.` (D-15). Shown in every state: from `run.next` when there is a run, from this constant otherwise. |
| `Row` | A `dt`/`dd` pair with the amount right-aligned in `tabular-nums`; `strong` adds a top rule and bold for totals. |
| `Flags` | The review flags as a list labelled `Review flags`, in the warning text colour. |
| `Blocked` | The two outcomes without a run. `standards_unavailable`: heading `Standards unavailable` and one sentence asking staff to check the county and household. `information_needed`: heading `Information still needed`, each missing label as given, then any review flags. No amounts in either (T-07-17). |
| `RunDetails` | The cards below the recommendation: Box D (monthly income), Box E (allowable expenses) and Box F (net disposable income, bold); each NRE line with the engine's label (reserve, × 0.8, exemptions, $11,980) and `Total net realizable equity` from `net_realizable_equity`; `Suggested amount` with, for payment paths, `{owed} ÷ {months} months, rounded up to the cent` from `payment_math`; and the context: county and state and household size from `standards_inputs`, `IRS standards effective {date}`, and who ran it and when. |
| State | `useLatestEvaluation` (the newest stored run), `useRunEvaluation` (its `data` is the last attempt) and `useExportWorksheet`. The last attempt wins: if it returned missing facts or unavailable standards, the rail shows `Blocked` and hides the older run's amounts. Otherwise the run is the attempt's run, or the latest stored run. |
| Recommendation card | With a run: the short label (`outcome.label`, or the path when the path has no short label) as the heading, then `path` and `reason` verbatim, then the flags. Without a run or attempt: `No evaluation yet` and a one-line hint. The review note closes the header. |
| `Run evaluation` | Primary button; while running it is disabled with a spinner and `Running…`. |
| `Export worksheet PDF` | Outline button, disabled without a run and while exporting (`Exporting…`). It calls `exportWorksheet(caseId, run.id)`. The result shows only while it belongs to the run on screen: `Worksheet saved.` then a `Push it from the request page` link to `/admin/requests/$requestId`, or `Create a request for this case to push it.` when the case has no request. A re-export (`already: true`) reads the same. |
| Layout | `data-rail` container, `lg:sticky lg:top-20`, so the rail stays in view while the sections scroll on large screens. |

## Tests

`recommendation-rail.test.tsx` (`web` project; `./api` partially mocked, `@tanstack/react-router` mocked so `Link` is a plain anchor):

- a simple-plan run shows the label, `path` and `reason` verbatim, the review note, Boxes D, E and F, the seven NRE labels and the total, `Suggested amount $1,234.57`, `$12,345.67 ÷ 10 months, rounded up to the cent`, the county, household and `IRS standards effective Jun 29, 2026`, the flags as a list, and a `lg:sticky` container;
- a run without `payment_math` shows no payment math;
- `Run evaluation` returning `information_needed` shows `Information still needed` with the label and no dollar amounts; `standards_unavailable` shows `Standards unavailable` and no dollar amounts;
- without a run, `Export worksheet PDF` is disabled and the review note still shows;
- exporting calls `exportWorksheet('C1', 'run1')` and links `Push it from the request page` to `/admin/requests/r1`; an export with no request asks for one.
