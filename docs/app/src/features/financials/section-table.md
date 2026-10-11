# `app/src/features/financials/section-table.tsx`

`SectionTable({ caseId, view, section, run?, onOpenEvidence?, children? })`: one collapsible statement section of the 433-A page (D-14), a shadcn `Card` holding a shadcn `Table` of `LineRow`s.

| Part | What it does |
|------|--------------|
| `num(v)` | Keeps a number, turns anything else into `null`. |
| `singles` | The section's lines that have a column and exactly one open proposal. Lines with competing proposals need a staff choice, so they are left out (D-06). |
| `acceptAll()` | Calls `useDecide(caseId).mutateAsync({ column, action: 'accept', proposal_id })` once per line in `singles`, one after another. On the first failure it stops (the mutation's own `onError` has already toasted, and its `onSettled` refetches the view). `running` disables the button meanwhile. |
| Header | An `h2` wrapping a full-width button with `aria-expanded` and `aria-controls` pointing at the body; the chevron turns when collapsed. Sections start open. |
| Body | `CardContent` with `hidden` when collapsed. First the outline `Accept all proposed in this section` button (only when `singles` is not empty), then `children` (the page puts the county row and the employers there), then the table. |
| Table header | `Line`, `Item`, `Value` (or `Actual` in the expenses section), then `IRS standard` and `Allowed` for expenses only, then `Status` and `Actions`. Header row `bg-muted` per the UI-SPEC dense-table convention. |
| Rows | One `LineRow` per line, each given `onOpenEvidence` (the page's evidence handler, Plan 10). For expense rows it passes `standardValue = run.standards_inputs[standard_key]` (when a number) and `allowedValue = run.allowable_breakdown[allowable_key]`; both are values the engine stored on the run, read as-is. The health standard is two keys in the bundle (under and over 65), so line 42 shows only its allowed amount. |

Tested in `financials-page.test.tsx` (see `financials-page.md`).
