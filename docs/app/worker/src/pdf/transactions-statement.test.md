# `app/worker/src/pdf/transactions-statement.test.ts`

Unit tests of the transaction-statement layout and one real render. They run in the `worker-node` Vitest project with no network and no database.

| Helper | What it does |
|--------|--------------|
| `measure` | Fixed width, half the font size per character, so results do not depend on font metrics. |
| `textOf(pages)` | Every line's text on every page, joined with spaces. |
| `rowsOf(pages)` | Lines that share a baseline (`y`), left to right, joined with ` \| `, so a table row reads `2026-09-20 \| Rent \| -$12.34`. |
| `txn`, `input` | Fixtures: a Checking ••1234 account for September 2026 with one deposit (−$1,000) and two debits ($12.34, $5.66). |

## Cases

- **signedMoney and totals**: `12.34` → `-$12.34`, `-1000` → `+$1,000.00`, `0` → `$0.00`; totals of the fixture are `{ moneyIn: 1000, moneyOut: 18, net: 982 }`, and `0.1 + 0.2` rounds to `0.3`.
- **content**: the title `Transaction statement — September 2026`, the account line `Checking ••1234`, the disclaimer, the column header, the three body rows in date order with `ACME Payroll` (merchant name preferred), `—` (no name at all) and `Rent`, and the totals rows `Money in | $1,000.00`, `Money out | $18.00`, `Net | $982.00`.
- **negative net / no name**: an account without name or mask prints `Account`; a single $40 debit gives `Net | -$40.00`.
- **header/footer**: on the single page, the first line is `HEADER_TEXT` and the last is `DISCLAIMER Page 1 of 1`.
- **pagination**: 120 rows span at least 3 pages; every page carries the header first and `Page i of n` last with consecutive numbers; no body line sits below the 70 pt bottom margin; `Row 120` and `Money out | $7,260.00` are printed.
- **WinAnsi and truncation**: `王 Café 😀` prints as `? Café ?`; a description wider than the column is cut and ends with `…`.
- **longMonth**: `January 2026`, `December 2025`.
- **renderTransactionStatement**: bytes start with `%PDF-`, `PDFDocument.load` gives one page, and the Title metadata is `DOC_TITLE`.
