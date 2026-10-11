# `app/src/features/financials/evidence-sheet.tsx`

`EvidenceSheet({ caseId, target, onClose, returnFocus?, kind? })`: the right-side Sheet that shows where one 433-A figure comes from (D-09, D-10, FORM-03). The page opens it when staff click a figure in a `LineRow`. It renders the Worker's `EvidenceView` as given and computes no amount. It is read-only: there is no per-transaction exclusion (D-10, deferred); staff correct a figure through Edit with a note.

| Part | What it does |
|------|--------------|
| `EvidenceTarget` | `{ column, proposalId }`: the figure that was clicked. `proposalId` is `null` for the value cell of a line with no confirming proposal; the Worker then picks the newest proposal. |
| `formatMonth(iso)` | `2026-07-01` -> `Jul 2026`, in UTC so no time zone moves the month. |
| `Money` | `formatMoney` in a `tabular-nums` span. |
| `Bank` | The window caption (`Window Jul 1, 2026 – Sep 30, 2026 (3 months)`), one table with `Date`, `Description` (merchant, else name), `Account` and a right-aligned `Amount`. Each month lists its transactions, then a `Subtotal {Mon YYYY}` row (`data-month`) with the server's exact subtotal. Below: `Monthly average` (`data-average`), the truncated note when more than 500 transactions exist, and the cross-check line when the Worker sends one. |
| `MonthRows` | One month's transaction rows and its subtotal row. |
| `Of<K>` | The `EvidenceView` variant of one kind. |
| `Facts` | A two-column `dl` of label and value pairs (values keep line breaks), used by the single-fact kinds. |
| `External` | A link that opens in a new tab with `rel="noopener noreferrer"`. The signed URL is a bearer link for five minutes, so the new tab gets no opener and no referrer. |
| `Payroll` | The window caption, a stub table (`Pay date`, `Employer`, right-aligned `Gross`, `Frequency`, and `Open pay stub` through `External` or a muted `No PDF`), one `data-formula` line per employer (`{employer}: {sum} over {n} stubs × {periods} pay periods a year ÷ 12 = {monthly} a month`), `Proposed value` (`data-value`, formatted by the line kind), the method, and the cross-check line. |
| `Balances` | An account table (`Account` with its `••mask` label, `Type` as `type · subtype`, right-aligned `Balance`, `As of` date) and a `Total` row (`data-total`) with the proposal value. |
| `Address` | `Address` (line 1, line 2, `City, ST ZIP` on separate lines, or `Not stored` for a Logics-address fallback), `County`, `FIPS`, `Source` (the proposal's ref label). |
| `Body` | Picks the renderer by `kind`. `intake`: `Question`, `Answer`, `Answered`. `logics`: `Logics field`, `Value`, `Fetched`. `staff`: `Entered by`, `When`, `Note`, `Value`. `document`: a list of `Open {name}` links through `External`. `none`: `No source yet`. Values are formatted with `formatValue(kind, value)` and timestamps with `formatDate` (viewer's time zone). |
| `EvidenceSheet` | `useQuery(['evidence', caseId, column, proposalId])` calls `getEvidence` only while a target is set. The shadcn `Sheet` is open while `target` is set; closing (overlay, Escape or the close button) calls `onClose`. `SheetContent side="right"`, full width on phones and `sm:max-w-xl` above, scrolls on its own. The title is the line label from the Worker (`Evidence` while loading); the description says to close the Sheet and use Edit with a note to correct a figure. Pending shows a `Skeleton`; an error shows the generic staff copy. `kind` (default `text`) is the line's kind, so a money answer reads `$12,345.67` and a boolean `Yes`/`No`. |
| Focus | There is no `SheetTrigger`, so Radix cannot restore focus by itself. `onCloseAutoFocus` prevents Radix's default and focuses `returnFocus.current`, the figure button the page recorded on click. |

## Tests

`evidence-sheet.test.tsx` (`web` project; `./api` partially mocked, `sonner` and `@/lib/supabase` mocked):

- through the whole `FinancialsPage`: clicking a Plaid proposal figure calls `getEvidence('C1', 'interest_dividends_royalties', P3)` and opens the Sheet titled with the line label, listing `Subtotal Jul 2026`, `Aug 2026` and `Sep 2026` with their amounts, the window caption, the account label, the average and the truncated note; closing returns focus to the figure button;
- clicking a confirmed value cell sends the confirming proposal id, and a `none` view reads `No source yet`;
- rendering the Sheet directly: payroll shows `Open pay stub` with the signed URL, `target="_blank"` and `rel="noopener noreferrer"`, `No PDF` for a stub without a document, the formula, the proposed value and the cross-check; balances show the account row and the total; intake, Logics, address and staff render their label/value lists; documents render `Open {name}` new-tab links;
- `isEvidenceView` rejects a non-https document link and an unknown kind.
