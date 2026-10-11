# `app/src/features/financials/line-row.tsx`

`LineRow({ caseId, line, view, standardValue?, allowedValue?, onOpenEvidence? })`: one 433-A line as a table row with every decision the decide RPC supports (D-06, D-10, D-14, FORM-03, FORM-04). It renders the Worker's values as given and computes nothing.

| Part | What it does |
|------|--------------|
| `amount(v)` | `formatMoney` for a number, `—` otherwise (no run yet, or no standard for the line). |
| `valueOf(view, column)` | The current value of another line in the view. |
| `NOT_APPLICABLE` | One predicate per `na_rule`: `not_married` when `filing_status_married` is `false` (spouse age, joint offer), `owns_home` when `owns_home` is `true` (`rents_home`), `not_wage_earner` when `is_wage_earner` is `false` (`pay_frequency`). An unknown fact never makes a line not applicable. |
| `Caption` | Under the label: `Edited by {name}` for an edited line, `Confirmed · from {Source}` for a confirmed line with a source, plain `Confirmed` without one, nothing for an undecided line. |
| `Small` | A small outline `Button` (`type="button"`), the style of every row action. |
| `OpenEvidence` | Exported type `(column, proposalId, opener) => void`: the page's handler that opens the evidence Sheet (D-10, Plan 10). `opener` is the clicked button, so the Sheet can return focus to it. |
| `Figure` | A figure as a dotted-underline `tabular-nums` button whose `aria-label` reads `{value}, show where {label} comes from`; it calls the evidence handler. Without `onOpenEvidence` (row tests, other callers) it is a plain `tabular-nums` span. |
| `evidence(proposalId)` | The click handler for one figure, or `undefined` when the line has no column or the page offers no Sheet. |
| `act(body, onDone?)` | `useDecide(caseId).mutate({ column, ...body })`; `onDone` runs on success (closing the dialog). Every action is one RPC call; `useDecide` refetches the view afterwards and handles `proposal_stale`. |
| Line cell | The form line number (`21`, `27-28`), muted and `tabular-nums`. |
| Item cell | The label, the caption, and every open proposal side by side: its value (a `Figure` that opens that proposal's evidence), its `SourceBadge`, `Accept` (`accept` with the proposal id) and `Reject` (`reject` with the proposal id). Their `aria-label`s name the source and the line. |
| Value cell | Right-aligned, `tabular-nums`, `data-value`: `formatValue(kind, value)` in a `Figure` that opens the confirming proposal's evidence (`confirmed.proposal_id`, else `null` so the Worker picks the newest proposal), so an unknown reads `Needs data` and never `$0.00` (D-06). Standard-only expense lines (column `null`) show `—`. |
| Expense cells | Only in the expenses section: IRS standard (`standardValue`) and Allowed (`allowedValue`), both from the latest run, `—` without one. |
| Status cell | `StatusChip`. |
| Actions cell | Only for lines with a column. `Edit` opens `DecideDialog` in edit mode; Save sends `edit` with the value, the note and the first open proposal's id when there is one. `Known $0` (money and count lines only) sends `known_zero`. `Unknown` (only when a value is set) sends `unknown`. `Not applicable` (only when `NOT_APPLICABLE` says so) opens the dialog for a note and sends `not_applicable`. Each button's `aria-label` names the line. All actions are disabled while a decision is in flight. |

`data-line` holds the column (or the allowable key for a standard-only line) and `data-proposal` the proposal id, as test hooks.

## Tests

`line-row.test.tsx` (`web` project; `./api` partially mocked, `sonner` and `@/lib/supabase` mocked; the row renders inside a `<table>` next to a `useFinancials('C1')` observer so invalidations refetch):

- a proposed line shows `Proposed`, the proposal value in a `tabular-nums` span, a right-aligned `tabular-nums` value cell, the `Plaid` badge, and `Accept`, which calls `decide('C1', 'household_size', { action: 'accept', proposal_id })`;
- a confirmed intake line reads `Confirmed · from Intake` and a known zero shows `$0.00`;
- an edited line reads `Edited by Test agent`;
- an unknown line reads `Needs data` and nowhere `$0.00`;
- two proposals (Plaid $1,500, Intake $1,400) render side by side; Intake's Accept and Plaid's Reject send their own ids (`reject`);
- Edit keeps Save disabled without a note or with `1,250.505` (showing the parser message), then sends `edit` with `1250.5`, the note and the first proposal id, and closes;
- `Known $0` sends `known_zero` and `Unknown` sends `unknown`; a bool line has no `Known $0`;
- `Not applicable` appears on spouse age only when not married, on `rents_home` only when the client owns, and on `pay_frequency` when not a wage earner, where it requires a note and sends `not_applicable`;
- a 409 `proposal_stale` toasts `This value changed. The list is refreshed.` and refetches the view;
- an expense row shows Actual, IRS standard and Allowed as `$2,100.00`, `$2,300.00`, `$1,900.00`.
