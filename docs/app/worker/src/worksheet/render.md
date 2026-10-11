# `app/worker/src/worksheet/render.ts`

Draws the worksheet layout into a US Letter PDF with `@cantoo/pdf-lib@2.11.1` (Plan 07-06, D-16). The dependency was installed in Phase 5; this plan adds none.

| Part | What it does |
|------|--------------|
| `renderWorksheet(input)` | Creates a `PDFDocument`. Sets the document title to `433-A screening worksheet (not an IRS form)` and the producer to `ResSpark`. Embeds `StandardFonts.Helvetica` and `HelveticaBold`. Calls `layoutWorksheet` with a measure function built on `font.widthOfTextAtSize`, so line wrapping uses the real glyph widths. Adds one `PageSizes.Letter` page per layout page and draws each line with `drawText`. A right-aligned line is drawn at `x - width`, so its text ends at `x` (the table's money columns). Returns `{ bytes, pages }`. |
| `save({ objectsPerTick: Infinity })` | Same as `pdf/image-to-pdf.ts`: on Workers the default would yield between object batches, which serves no purpose here. |

The output is plain text only. It has no AcroForm fields, no JavaScript, no annotations and no official IRS PDF underneath (T-07-26, D-16 "Deferred: official forms").

Tests: `app/worker/src/worksheet/render.test.ts` (`%PDF-` magic bytes, the page count matches the layout, a CJK client name does not throw).
