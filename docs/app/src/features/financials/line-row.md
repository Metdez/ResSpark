# `app/src/features/financials/line-row.tsx`

`LineRow({ caseId, line, view, standardValue?, allowedValue? })`: one 433-A line as a table row (D-10, D-14, FORM-03). It renders the Worker's values as given and computes nothing.

| Part | What it does |
|------|--------------|
| `amount(v)` | `formatMoney` for a number, `—` otherwise (no run yet, or no standard for the line). |
| `Caption` | Under the label: `Edited by {name}` for an edited line, `Confirmed · from {Source}` for a confirmed line with a source, plain `Confirmed` without one, nothing for an undecided line. |
| Line cell | The form line number (`21`, `27-28`), muted and `tabular-nums`. |
| Item cell | The label, the caption, and every open proposal side by side: its value (`tabular-nums`), its `SourceBadge`, and a small outline `Accept` whose `aria-label` names the source and the line. Accept calls `useDecide(caseId).mutate({ column, action: 'accept', proposal_id })`. |
| Value cell | Right-aligned, `tabular-nums`, `data-value`: `formatValue(kind, value)`, so an unknown reads `Needs data` and never `$0.00` (D-06). Standard-only expense lines (column `null`) show `—`. |
| Expense cells | Only in the expenses section: IRS standard (`standardValue`) and Allowed (`allowedValue`), both from the latest run, `—` without one. |
| Status cell | `StatusChip` for the line status. |

`data-line` holds the column (or the allowable key for a standard-only line) and `data-proposal` the proposal id, as test hooks.

## Tests

`line-row.test.tsx` (`web` project; `./api` partially mocked, `sonner` and `@/lib/supabase` mocked, rendered with `renderWithQuery` inside a `<table>`):

- a proposed line shows `Proposed`, the proposal value in a `tabular-nums` span, a right-aligned `tabular-nums` value cell, the `Plaid` badge, and `Accept`, which calls `decide('C1', 'household_size', { action: 'accept', proposal_id })`;
- a confirmed intake line reads `Confirmed · from Intake` and a known zero shows `$0.00`;
- an edited line reads `Edited by Test agent`;
- an unknown line reads `Needs data` and nowhere `$0.00`.
