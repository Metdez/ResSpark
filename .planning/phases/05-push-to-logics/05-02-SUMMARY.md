---
phase: 05-push-to-logics
plan: 02
subsystem: worker
tags: [pdf, cantoo-pdf-lib, normalization, logics, vitest]
status: complete

requires: []
provides:
  - "splitPdf(bytes, targetBytes): greedy page splitter, last-good-save, error codes"
  - "sniffImage / imageToPdf: magic-byte image detection and JPEG/PNG -> PDF"
  - "normalizeForLogics: 40 MiB gate, sniff, wrap, split, part naming, per-part sha256"
  - "test fixtures: generated multi-page/oversized/encrypted PDFs, TINY_JPEG/TINY_PNG/HEIC_STUB"
affects: [05-03 consumer, 05-04 push UI error copy]

actuals:
  tokens: 9000
  tasks: 2
  commits: 4
plan_head_before: 1cb9505fda1bace7637cead9c12f40274a90658c
plan_head_after: b257098948279fb417e3ac9052515ccb3919cc04

tech-stack:
  added: ["@cantoo/pdf-lib 2.11.1 (MIT)"]
  patterns: ["pure, parameterized byte-processing modules tested under worker-node with a tiny targetBytes", "invariant re-check that throws instead of returning an oversize part"]

key-files:
  created:
    - app/worker/src/pdf/split-pdf.ts
    - app/worker/src/pdf/image-to-pdf.ts
    - app/worker/src/pdf/normalize-for-logics.ts
    - app/worker/src/pdf/test-fixtures.ts
    - app/worker/src/pdf/split-pdf.test.ts
    - app/worker/src/pdf/image-to-pdf.test.ts
    - app/worker/src/pdf/normalize-for-logics.test.ts
    - app/worker/src/pdf/test-fixtures.test.ts
    - docs/app/worker/src/pdf/split-pdf.md
    - docs/app/worker/src/pdf/image-to-pdf.md
    - docs/app/worker/src/pdf/normalize-for-logics.md
    - docs/app/worker/src/pdf/test-fixtures.md
  modified:
    - app/package.json
    - pnpm-lock.yaml
    - app/LICENSES.md

key-decisions:
  - "An over-gate PDF with zero pages is pdf_unparseable, so it can never produce an empty parts list"
  - "makeEncryptedPdf returns bytes, never null: @cantoo/pdf-lib 2.11.1 exposes encrypt(), so the encrypted test runs instead of being skipped"
  - "makeMultiPagePdf takes bytesPerPage as a number or a per-index function, which builds the page-7-oversized fixture"

requirements-completed: [PUSH-02]

duration: ~30 min
completed: 2026-10-11
---

# Phase 5 Plan 02: PDF normalization for Logics Summary

**The worker can now turn any stored upload into PDF parts no larger than the gate, each with a name and a SHA-256 hash. It uses a greedy `@cantoo/pdf-lib` page splitter and a JPEG/PNG wrapper that trusts magic bytes, not the declared type. A file it cannot fit gets a specific `needs_manual_compression` code and is never degraded.**

## Accomplishments

- `@cantoo/pdf-lib@2.11.1` installed with an exact pin in `app/package.json`. The root `pnpm-lock.yaml` was updated and no lockfile was created under `app/`. The MIT attribution is in `app/LICENSES.md`, and `unpdf` was not installed.
- `splitPdf`:
  - A file at or under the gate is returned as the same `Uint8Array`, without being loaded.
  - Pages are added one at a time, and the last save that fit becomes a part.
  - It returns `pdf_page_too_large` with the 1-based page number, `pdf_encrypted` (the empty-password retry fails), or `pdf_unparseable`.
  - It throws `split_invariant` rather than return a part over the gate.
- `sniffImage` and `imageToPdf`:
  - `sniffImage` checks magic bytes only: `FF D8 FF`, `89 50 4E 47`, and `ftypheic`/`ftypheix`/`ftypmif1` at offset 4.
  - `imageToPdf` makes one page per image, sized to its pixel dimensions in points.
- `normalizeForLogics`:
  - Files over 40 MiB are rejected before any parse.
  - HEIC returns `image_unsupported_format`. A file that is not an image must start with `%PDF-` or it returns `pdf_unparseable`.
  - Parts are named with `partFileName`. An unsplit PDF keeps its exact name and bytes.
  - Each part gets its own SHA-256, and a `normalize_invariant` re-check runs before returning.
- Each code module has a companion doc with a line-by-line table and a `## Tests` section (D-23). The `normalize-for-logics.md` doc includes the table mapping each error code to its UI copy, for Plan 04.

## Recorded facts (requested by the plan)

- `pnpm view @cantoo/pdf-lib@2.11.1 version license` → `version = '2.11.1'`, `license = 'MIT'`.
- **Fixture approach:** each page gets a private uncompressed stream registered under `/Resources /XObject /RsPad` via `page.node.setXObject`. These streams survive `copyPages`. The PNG-pad fallback was not needed.
- **Encrypted fixture:** available. `PDFDocument.encrypt({ userPassword, ownerPassword })` works in 2.11.1. `load(bytes, { password: '' })` throws for a user-password file, so the `pdf_encrypted` test runs and is not skipped.
- **12-page × 50,000-byte fixture at `targetBytes` 200,000:** 4 parts of 151,269 bytes each, 3 pages per part.
- **Splitter wall-clock** for that fixture: 38 ms for `splitPdf` alone in Node 24 (the whole test took 56 ms). This feeds the Plan 03 `limits.cpu_ms` decision. Workers CPU will differ, and real 5.5 MiB parts make each `save()` proportionally larger.
- `pnpm check` (size gate, `tsc -b`, eslint, web + worker-node tests) is green: 13 files and 56 tests. `worker/src/pdf` alone: 4 files, 21 tests.

## Task Commits

1. **Task 1: install, fixtures, splitter.** RED `3513eaf` (`test`), GREEN `f9c284b` (`feat`).
2. **Task 2: imageToPdf + normalizeForLogics.** RED `69ed10a` (`test`), GREEN `b257098` (`feat`).

## TDD Gate Compliance

- Task 1: RED `3513eaf` failed because `./test-fixtures` and `./split-pdf` did not exist yet. GREEN `f9c284b` passes 10/10.
- Task 2: RED `69ed10a` failed because `./image-to-pdf` and `./normalize-for-logics` did not exist yet, while the 10 earlier tests still passed. GREEN `b257098` passes 21/21.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zero-page over-gate PDF would return an empty parts list**
- **Found during:** Task 1
- **Issue:** The splitter skeleton returns `{ parts: [] }` for a file over the gate that has no pages. The consumer would then "send" nothing, with no error.
- **Fix:** `if (src.getPageCount() === 0) return { error: 'pdf_unparseable' }`.
- **Files modified:** `app/worker/src/pdf/split-pdf.ts`
- **Commit:** `f9c284b`

**2. [Interface adjustment] `makeEncryptedPdf(): Promise<Uint8Array>` (was `Uint8Array | null`)**
- The `null` branch could not happen with the installed version, so the test runs unconditionally and is not skipped.

**3. [Interface adjustment] `makeMultiPagePdf(pages, bytesPerPage: number | ((i) => number))`, plus a test-only `readPadIndex(page)` export**
- These were needed for the "page 7 alone is oversized" case and for checking page order. They are test-only and nothing in production imports `test-fixtures.ts`.

**4. [Lint/type fixes] Test hygiene**
- The timing `console.info` was removed from the splitter test because of ESLint `no-console`. The timing was measured once and is recorded above.
- `import.meta.dirname` replaced `fileURLToPath(new URL(...))` because of a DOM/Node `URL` type clash under `tsc`.
- The pad is read through `PDFStream.getContents()` because the typed `lookup` overloads do not accept `PDFRawStream`.

Otherwise the plan was executed as written.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes. The modules never log. T-05-10, T-05-11, and T-05-13 are mitigated by `source_too_large`, magic-byte sniffing, and the two invariant re-checks.

## Self-Check: PASSED

- Every created file listed in key-files is present on disk.
- Commits `3513eaf`, `f9c284b`, `69ed10a`, and `b257098` are ancestors of HEAD.
- `app/pnpm-lock.yaml` is absent, and `app/package.json` contains `"@cantoo/pdf-lib": "2.11.1"` and no `unpdf`.
