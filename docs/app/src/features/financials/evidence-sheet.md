# `app/src/features/financials/evidence-sheet.tsx`

`EvidenceSheet({ caseId, target, onClose, returnFocus? })`: the right-side Sheet that shows where one 433-A figure comes from (D-10, FORM-03). The page opens it when staff click a figure in a `LineRow`. It renders the Worker's `EvidenceView` as given and computes no amount.

| Part | What it does |
|------|--------------|
| `EvidenceTarget` | `{ column, proposalId }`: the figure that was clicked. `proposalId` is `null` for the value cell of a line with no confirming proposal; the Worker then picks the newest proposal. |
| `formatMonth(iso)` | `2026-07-01` -> `Jul 2026`, in UTC so no time zone moves the month. |
| `Money` | `formatMoney` in a `tabular-nums` span. |
| `Bank` | The window caption (`Window Jul 1, 2026 – Sep 30, 2026 (3 months)`), one table with `Date`, `Description` (merchant, else name), `Account` and a right-aligned `Amount`. Each month lists its transactions, then a `Subtotal {Mon YYYY}` row (`data-month`) with the server's exact subtotal. Below: `Monthly average` (`data-average`), the truncated note when more than 500 transactions exist, and the cross-check line when the Worker sends one. |
| `MonthRows` | One month's transaction rows and its subtotal row. |
| `Body` | Picks the renderer by `kind`; `none` reads `No source yet`. |
| `EvidenceSheet` | `useQuery(['evidence', caseId, column, proposalId])` calls `getEvidence` only while a target is set. The shadcn `Sheet` is open while `target` is set; closing (overlay, Escape or the close button) calls `onClose`. `SheetContent side="right"`, full width on phones and `sm:max-w-xl` above, scrolls on its own. The title is the line label from the Worker (`Evidence` while loading); the description says the Sheet is read-only and that a figure is corrected with Edit and a note. Pending shows a `Skeleton`; an error shows the generic staff copy. |
| Focus | There is no `SheetTrigger`, so Radix cannot restore focus by itself. `onCloseAutoFocus` prevents Radix's default and focuses `returnFocus.current`, the figure button the page recorded on click. |

## Tests

`evidence-sheet.test.tsx` (`web` project; `./api` partially mocked, `sonner` and `@/lib/supabase` mocked; renders the whole `FinancialsPage`):

- clicking a Plaid proposal figure calls `getEvidence('C1', 'interest_dividends_royalties', P3)` and opens the Sheet titled with the line label, listing `Subtotal Jul 2026`, `Aug 2026` and `Sep 2026` with their amounts, the window caption, the account label, the average and the truncated note; closing returns focus to the figure button;
- clicking a confirmed value cell sends the confirming proposal id, and a `none` view reads `No source yet`.
