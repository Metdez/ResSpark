# `app/worker/src/financials/view.test.ts`

Unit tests for `buildFinancialsView`, which is pure, so the suite needs no database.

| Part | What it does |
|------|--------------|
| `golden` / `COMPLETE` | The complete canonical row (`test_complete_database_row_reaches_v2_determination`) from the engine golden fixture, read with `readFileSync`. |
| `CASE`, `proposal(over)`, `build(...)`, `line(...)` | Fixtures and helpers. `proposal` makes a `proposed` Plaid row for `gross_wages_taxpayer`. `build` passes `{ S1: 'Sandra' }` as the staff names. `line` finds a line by column, and also by label for the two lines that have no column. |

## Cases

- **Competing proposals.** When the value is null and there are two `proposed` rows (`plaid` and `intake`), the status is `proposed` and both rows are listed.
- **No proposals.** A null value with no proposals is `needs_data`.
- **Edited.** A set value whose latest accepted or edited row is `edited` has status `edited`. `confirmed` names that row, its source, the decider's name and the time. An older `accepted` row and a later `rejected` row are both ignored.
- **Confirmed with no decided row.** A set value with no decided row is `confirmed`, and every field of `confirmed` is null.
- **Required counts.** A complete row gives `{ confirmed: 63, total: 63, missing: [] }`, which is the 58 required columns plus the 5 question-only columns. With three facts nulled, `missing` is sorted and `confirmed` is 60. An absent row counts as all missing.
- **Standard-only lines.** Lines 36 and 42 have status `standard`, a `null` column and no proposals.
- **Settings.** By default the window is 3 months with no spouse employers. `window_months: 6` is kept, and non-string employer ids are dropped.
- **Section order.** The seven sections come back in order.
