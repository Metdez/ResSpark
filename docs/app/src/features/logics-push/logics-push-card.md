# `app/src/features/logics-push/logics-push-card.tsx`

The `Push to Logics` card on `/admin/requests/$requestId`, mounted below the review panel (Phase 5 D-09, PUSH-01, PUSH-02, PUSH-04).

| Part | What it does |
|------|--------------|
| `Heading` | `Push to Logics`, 20 px semibold, the same heading style as the review panel. |
| `Row` | A `PushableDoc` plus its item label, its ledger rows, `done` (the latest rows include `sent` or `unknown` and nothing is in flight), and `disabled`. |
| `LogicsPushCard({ requestId, caseId })` | Reads `useReview(requestId)` (the same cached query as the review panel), `useLedger(requestId)`, and the signed-in staff name from `useSession()`. While the review loads: three 40 px `Skeleton` rows; on a review error: the generic error line (the review panel above shows the full alert with Retry). |
| Pushable rule | Only documents with `status 'ready'` under items with `status 'approved'`. Rejected files and files of items not yet approved never appear. |
| Empty block | When nothing is pushable: the inherited empty block (48 px icon, `Nothing approved yet`, `Approve an item and its files appear here.`). |
| `disabled` | A row cannot be selected when its plan is `manual`, when a row is `queued`/`sending`, or when it is `done` and `Push again` is not ticked. |
| Ledger error | A destructive line `Couldn't load what was already pushed.` with a `Retry` link; the push button stays disabled until the ledger loads, because the duplicate guard needs it. |
| Groups | Rows are grouped under their item label (14 px muted heading). |
| Push button | Right-aligned. Label `Push to Logics` only when the ledger says `mode 'live'`; otherwise `Push to Logics (simulated)`. Disabled with nothing selected. It opens the confirmation sheet with the selected rows. |
| `DocRow` | A 40 px dense row: `Checkbox` (`aria-label` `Select {name}`), the name (`title` holds the full name), `sizeLabel`, the plan label (muted, or destructive for `manual`), one `PushChip` per ledger row, one muted `Simulated` badge when any row is `mode 'fake'`, and for `done` rows the text `Already pushed` with a `Push again` checkbox (`aria-label` `Push {name} again`). Ticking it re-enables the row and sends its id in `push_again`. |
| `PushChip` | `part k of n` when `part_count > 1`; then the state badge. `unknown` is a button labelled `Needs your decision` that opens the resolution dialog. `sent` adds `#<CaseDocumentID>`, or `Confirmed by staff` when staff marked it sent without an id. `failed` adds the `error_detail` copy, then either `Compress it outside ResSpark and re-upload to the item` (manual compression) or a `Re-send` link that opens the dialog in resend-only mode. |

## Safety rules

- There is no retry-all, auto-retry, or background re-send control. The only ways out of `unknown` are the two staff decisions in the dialog (D-04).
- The `Simulated` badge and the `(simulated)` label cannot be hidden or dismissed (D-10, Pitfall 7).

## Tests

`logics-push-card.test.tsx` (`web` project; `useReview`, `useSession`, `./api` and `sonner` mocked; `useQuery` spied): empty block; two ready PDFs of an approved item listed with `Sends as 1 file` and `Will split into about 2 parts`, rejected and not-approved files absent, the button disabled until a checkbox is ticked; `Push to Logics` in live mode; the ledger query uses `pollInterval`; a fake `sent` row shows `Sent`, `#128346`, `Simulated`, `Already pushed`, a disabled checkbox, and `Push again` re-enables it; `unknown` renders as the `Needs your decision` button and a two-part document shows `part 1 of 2` / `part 2 of 2` with the spinner on `sending`; a manual-compression failure shows its copy and no `Re-send`.
