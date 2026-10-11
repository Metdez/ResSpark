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

## Builders

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

## Sections, totals and equity

These blocks sit between the title and the recommendation, in D-14 form order.

| Part | What it does |
|------|--------------|
| `SOURCE_LABELS` / `sourceText(input, column)` | The source of a confirmed value: `Plaid`, `Truv`, `Intake`, `Logics`, `Address`, `Document` or `Staff`. An `edited` decision adds ` (edited)`, and the decider's name follows after a comma (`Plaid, Test agent`). A column with no recorded decision prints `Not recorded`. A standard-only expense line (no column) prints `IRS standard`. |
| `notApplicable(meta, snap)` | The `na_rule` of `financials/lines.ts`, read from the snapshot: `not_married` (married is No), `owns_home` (owns home is Yes) and `not_wage_earner` (W-2 wages is No). |
| `valueText(meta, v, snap)` | A null value prints `Not applicable` when its rule applies, otherwise `Unknown`. Money goes through `money`, booleans print Yes/No, and counts and text print as stored. |
| `COL` / `EXP` | x positions. General sections: line number 50, item 76, value right edge 380, source 392. Expense table: Actual right edge 300, IRS standard 380, Allowed 450, source 460. |
| `lineRows(input, meta, measure)` | One row per line: line number, label (shortened with `fit` if needed), the **snapshot** value and the source. A `money_list` (vehicle market values, vehicle loan balances) prints its label row, then one indented `Vehicle i` row per vehicle, or `None`. |
| `standardText(key, bundle)` | The IRS standard column, taken from the run's `standards_inputs`: national, housing, ownership or operating as stored. Health (line 42) prints the two per-person amounts, `under 65 / 65 and older`, because the bundle stores them per person. The allowed amount is the engine's. A missing standard prints `n/a`, and a line with no standard prints `—`. |
| `header(labels)` | The bold 8 pt column header row. |
| `expenseRows(input, measure)` | The table `Line \| Item \| Actual \| IRS standard \| Allowed \| Source` for lines 36-48. `Allowed` is `run.allowable_breakdown[allowable_key]`. A `Total allowable expenses` row appears when the breakdown has `total`, followed by a footnote on the line 42 standard. |
| `sectionRows(input, measure)` | For each `SECTIONS` entry: a heading, then the expense table or the generic `Line \| Item \| Value \| Source` table of that section's `LINES`. |
| `amountRow` / `totalsRows` | `Monthly totals`: Box D (`run.monthly_income`), Box E (`run.monthly_expenses`) and Box F (`run.net_disposable_income`, bold). `Net realizable equity`: each `run.nre_lines` label and value, then `run.net_realizable_equity` as the total. |

The worksheet does not split into `sections.ts`: `layout.ts` stays under 500 lines.

## Pagination (`paginate`)

The layout takes two passes (RESEARCH Pattern 6):

1. Rows go onto pages with a y cursor. A new page starts when a row plus its `keep` would cross the bottom margin.
2. Once the page count is known, every page gets the header and the footer `Page i of n`.

`layoutWorksheet(input, measure)` concatenates title, sections, totals and recommendation, then paginates.

Tests: `app/worker/src/worksheet/layout.test.ts`.
