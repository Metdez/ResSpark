# `app/worker/src/worksheet/layout.ts`

Pure page layout of the 433-A screening worksheet (Plan 07-06, D-16). It turns a `WorksheetInput` into Letter pages of positioned text lines. It does no I/O and computes no amounts: every number on the page is a value of the stored run or its snapshot, formatted with `money`.

## Disclaimer (every page)

- `HEADER_TEXT` = `Screening worksheet — Not an IRS form`, bold 10 pt at the top of every page.
- `FOOTER_TEXT` = `Prepared by ResSpark for review by a tax professional. Not an IRS form. Do not file.`, followed by `Page N of M`, 8 pt at the bottom of every page.

Andrew approves this wording (USER ACTION). Until then it is the D-16 text verbatim.

## Types

| Type | Meaning |
|------|---------|
| `WorksheetInput` | `firm_name`, `client_name`, `logics_case_id`, the run as a `RunView`, the run's `snapshot` (its `financial_data_snapshot`), `sources` (per column: the source, `accepted`/`edited` and the decider's name), the `standards` version (`effective_date`, `source_url`) and `generated_at`. It has no SSN or account-number field (T-07-25). |
| `WorksheetLine` | One piece of text: `text`, `x`, `size`, optional `bold`, and optional `align: 'right'` (x is then the right edge). |
| `WorksheetPage` | `lines` with a `y` baseline each, header and footer included. |
| `Measure` | `(text, size, bold) => width` in points. `render.ts` passes Helvetica's `widthOfTextAtSize`; unit tests pass a fixed-width function. |
| `Row` | One baseline of body text: its `height` (leading), its `items`, and an optional `keep`, the extra room it needs below it so a heading never ends a page. |

## Geometry

`PAGE` is 612 × 792 pt with 50 pt margins. `RIGHT` = 562 is the right edge. The body runs from y 722 down to y 60. The header baseline is at 752 and the footer at 32. Body text is `SIZE` 9 pt with 13 pt leading, and key/value values start at x 170.

## Builders (exported for `sections.ts`)

| Part | What it does |
|------|--------------|
| `line(text, x, size, opts)` | Builds a `WorksheetLine` and passes `text` through `toWinAnsi`, so no unencodable character reaches pdf-lib. |
| `spacer(h)` | An empty row. It is dropped at the top of a page and at a page break. |
| `heading(text)` | A bold 12 pt row with `keep` of two lines. |
| `wrap(text, width, size, bold, measure)` | Greedy word wrap at the measured width. A single word wider than the line is cut by characters. It always returns at least one string. |
| `fit(text, width, size, measure)` | Shortens text with `…` to fit a table cell (used for source labels). |
| `paragraph(text, measure, opts)` | Wrapped rows from `x` to the right margin. |
| `keyValue(label, value, measure)` | A bold label at the margin, with the wrapped value beside it. |

## Blocks

- `titleRows`: the title `433-A screening worksheet`, a one-line note that the worksheet is built from one run and confirmed facts only, then Firm, Client, Logics CaseID (`Not linked` when null), Run id, Run time (UTC, with the creator's name), Engine version, IRS standards (effective date and source URL), Location (county, state from the run's standards inputs), Household (people and vehicles) and Generated.
- `recommendationRows`:
  - Outcome label, then `path` and `reason` verbatim.
  - For payment paths (`payment_math` set): `<owed> ÷ <months> months, rounded up to the cent = <payment>`. All three numbers are the run's own values.
  - Otherwise, a non-zero `suggested_offer_or_payment` is shown as `Suggested amount`.
  - Manual review Yes/No, each review flag as a bullet, and the run's `next` sentence (`A tax professional must review this result before anything is filed.`) in bold.

## Pagination (`paginate`)

The layout takes two passes (RESEARCH Pattern 6):

1. Rows go onto pages with a y cursor. A new page starts when a row plus its `keep` would cross the bottom margin.
2. Once the page count is known, every page gets the header and the footer `Page i of n`.

`layoutWorksheet(input, measure)` concatenates the blocks and paginates them.

Tests: `app/worker/src/worksheet/layout.test.ts`.
