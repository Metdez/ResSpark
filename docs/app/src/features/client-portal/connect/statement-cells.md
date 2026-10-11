# `app/src/features/client-portal/connect/statement-cells.tsx`

`StatementCells({ account, onUploadMonth })`: one account's statement months in the bank sheet (D-10, BANK-03).

- `MonthCell` (exported type): `{ year, month, status }` from `ClientConnectionView`.
- The months are copied and sorted newest first (`year` then `month`, descending). The server already sends them that way; the sort is defensive and never mutates the prop.
- Each month is an `<li data-month-cell={status}>` row, at least 44 px tall (`min-h-11`), with `monthLabel(year, month)` (for example "Jun 2026") on the left and, on the right:

| Status | Shows |
| --- | --- |
| `available`, `manual` | a check icon and "Received" in the success color (the word carries the meaning, not the color) |
| `pending` | "Checking…" (muted) |
| `missing` | a full-width 44 px outline button "Upload your {month} statement for ••{mask}" |
| `not_supported` | "Not from this bank" (muted) above the same upload button |

- The upload button may wrap on a narrow phone, so it uses `h-auto min-h-11 whitespace-normal` instead of the fixed `h-11` of `size='xl'`.
- Clicking it calls `onUploadMonth(cell)`; the bank sheet then opens the upload sheet and attributes the new document to that month.

Copy comes from `CONNECT_COPY.bank` (`received`, `pendingCell`, `notSupported`, `uploadMonth`).
