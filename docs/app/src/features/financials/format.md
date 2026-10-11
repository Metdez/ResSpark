# `app/src/features/financials/format.ts`

Display and input helpers for 433-A values. They format and parse only; no IRS amount is computed here (CLAUDE.md).

| Part | What it does |
|------|--------------|
| `USD` | `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`, the UI-SPEC money format (`$1,234.56`). |
| `DAY` | `Intl.DateTimeFormat` for `Jun 29, 2026`, in UTC, because the inputs are calendar days (`2026-06-29`) that a local time zone would shift back a day. |
| `formatMoney(n)` | `USD.format(n)`. |
| `formatDay(iso)` | Formats the date part of an ISO string with `DAY`. |
| `formatValue(kind, v)` | `null` or `undefined` → `Needs data` (an unknown is never `$0`, D-06); booleans → `Yes`/`No`; money → `formatMoney`; a money list → each amount joined with `, `, or `None` when empty; anything else → `String(v)`. |
| `parseInputValue(kind, raw)` | Returns `{ ok: true, value }` or `{ ok: false, message }`. Money: strips `$`, commas and spaces, then allows an optional minus and at most 2 decimals (`$1,200.505` fails). Count: digits only. Bool: `yes`/`true`/`no`/`false`, any case. Money list: comma-separated non-negative amounts with at most 2 decimals and an optional leading `$`; since commas separate items, an item cannot use a thousands separator; an empty string is an empty list. Text: trimmed, 1-200 characters. The Worker validates again (`bad_value`). |

## Tests

`format.test.ts`: `$1,234.50`; `Needs data` for null; `$0.00` for a known zero; `Yes`/`No`; a money list; `Jun 29, 2026`; money with 3 decimals fails and `$1,200.50` parses; counts; the money list `10000, 5000.50` → `[10000, 5000.5]`; `No` → `false`; blank text fails.
