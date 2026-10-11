# `app/worker/src/worksheet/render.test.ts`

Unit tests of the pdf-lib renderer (Plan 07-06, D-16) in the `worker-node` Vitest project.

## Cases

- **Page count**: 60 review flags render to bytes that start with `%PDF-`. There are at least 2 pages, and `PDFDocument.load(bytes).getPageCount()` equals the `pages` that `renderWorksheet` reports, which is the layout's page count.
- **Non-Latin name**: a client name with CJK characters and an emoji renders and loads back without throwing (RESEARCH Pattern 6, Pitfall 11).
