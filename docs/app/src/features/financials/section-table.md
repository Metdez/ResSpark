# `app/src/features/financials/section-table.tsx`

`SectionTable({ caseId, view, section, run?, children? })`: one collapsible statement section of the 433-A page (D-14), a shadcn `Card` holding a shadcn `Table` of `LineRow`s.

| Part | What it does |
|------|--------------|
| `num(v)` | Keeps a number, turns anything else into `null`. |
| Header | An `h2` wrapping a full-width button with `aria-expanded` and `aria-controls` pointing at the body; the chevron turns when collapsed. Sections start open. |
| Body | `CardContent` with `hidden` when collapsed. `children` render above the table (the page puts the county block and employers there). |
| Table header | `Line`, `Item`, `Value` (or `Actual` in the expenses section), then `IRS standard` and `Allowed` for expenses only, then `Status`. Header row `bg-muted` per the UI-SPEC dense-table convention. |
| Rows | One `LineRow` per line. For expense rows it passes `standardValue = run.standards_inputs[standard_key]` (when a number) and `allowedValue = run.allowable_breakdown[allowable_key]`; both are values the engine stored on the run, read as-is. |
