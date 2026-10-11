# `app/worker/src/worksheet/layout.test.ts`

Unit tests of the worksheet text helpers and the page layout (Plan 07-06, D-16). They run in the `worker-node` Vitest project, with no network and no database.

| Part | What it does |
|------|--------------|
| `measure` | A fixed-width measure, half the font size per character, so the results do not depend on font metrics. |
| `textOf(pages)` | Every line's text on every page, joined with spaces. Wrapped paragraphs read back verbatim, because wrapping only splits at spaces. |

## Cases

- **text**:
  - `toWinAnsi('Zoë 王 — ok')` returns `Zoë ? — ok`. Tabs and newlines become spaces. Curly quotes and € pass, and an emoji becomes one `?`.
  - `money(1234.5)` returns `$1,234.50` and `money(-3)` returns `-$3.00`.
- **header/footer**: on every page, the first line is `HEADER_TEXT` and the last is `FOOTER_TEXT Page i of n`.
- **pagination**:
  - 40 review flags span at least 2 pages. The text contains `Page 2 of`, the page numbers run consecutively, and no body line sits below the 60 pt bottom margin.
  - The last flag is still printed.
- **content**: every section title, `Actual`, `IRS standard`, `Allowed`, `Box D`, `Box E`, `Box F`, the seven NRE labels, the run's `path` and `reason` verbatim, the review sentence, and the Box D and Box F amounts.
- **payment math**: `$28,000.00 ÷ 90 months, rounded up to the cent = $311.12`.
- **snapshot only**: changing `gross_wages_taxpayer` in the snapshot changes the printed value.
- **sources**: `Plaid, Test agent` and `Staff (edited)`.
- **vehicles and names**: `Vehicle 1` with `$15,000.00`, and a CJK character in the client name prints as `?`.
