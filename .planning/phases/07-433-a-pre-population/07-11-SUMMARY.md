---
phase: 07-433-a-pre-population
plan: 11
subsystem: worker/extract
status: complete
tags: [extractors, parity, golden-fixtures, pdf, no-llm]
requires: ["07-01 golden exporter and py.ts conventions"]
provides: ["app/worker/src/extract/* (pageText, parseTexts, parsePdf, ExtractError, mergeDocuments)", "golden-extract.json"]
affects: ["07-12 document-source proposals"]
tech-stack:
  added: []
  patterns: ["Python oracle -> generated JSON fixture -> TS toEqual parity", "exact bigint decimals for Python Decimal", "Python str/regex semantics ported explicitly (strip, \\b, \\s, latin1, repr)"]
key-files:
  created:
    - src/tools/golden_extract.py
    - app/worker/test/fixtures/engine/golden-extract.json
    - app/worker/src/extract/pdf-text.ts
    - app/worker/src/extract/fields.ts
    - app/worker/src/extract/classify.ts
    - app/worker/src/extract/parse.ts
    - app/worker/src/extract/transcript.ts
    - app/worker/src/extract/pay-stub.ts
    - app/worker/src/extract/bank-statement.ts
    - app/worker/src/extract/housing.ts
    - app/worker/src/extract/vehicle.ts
    - app/worker/src/extract/accounts.ts
    - app/worker/src/extract/business.ts
    - app/worker/src/extract/merge.ts
    - app/worker/src/extract/parity.test.ts
    - docs/src/tools/golden_extract.md
    - docs/app/worker/src/extract/*.md (13 files)
  modified:
    - src/tools/export_golden_fixtures.py
    - docs/src/tools/export_golden_fixtures.md
decisions:
  - "Test inputs for texts_cases/merge_cases are recorded by running test_document_parse with wrapped parse_texts/merge_documents at export time (calls made while urlopen is patched are skipped); outputs are recomputed by the oracle with the LLM off"
  - "parsePdf takes an optional label (default 'document') so error text matches Python's str(path); fixtures use the repo-relative path"
  - "Python non-ValueError failures (KeyError, InvalidOperation) are thrown as plain Error, ValueError as ExtractError, preserving Python's catch split"
metrics:
  duration: "~30 min"
  completed: 2026-10-11
actuals:
  tokens: 26400
  tasks: 3
  commits: 3
plan_head_before: 4812d4e0c22a5ea88a88ea76c53706727c7f8ae4
plan_head_after: 1b10ec4bdf30450624c0f8786207e739cf44c279
---

# Phase 7 Plan 11: Regex document extractors ported to TypeScript Summary

The TypeScript extractors in `app/worker/src/extract/` reproduce `src/document_parse.py` exactly. That covers the `_page_text` PDF text layer, every regex parser family, and `merge_documents`. Parity is checked with `toEqual` against `golden-extract.json`, which the unchanged Python oracle generates with the LLM and `.env` loading patched off.

## What was built

- **Task 1 (tracer), `b98947f`.** `src/tools/golden_extract.py` replaces `document_parse._load_env` with a no-op and `_llm_json` with `RuntimeError('llm_disabled')` at import, before any parse. `export_golden_fixtures.py` now writes both fixture files and `--check`s both. The TS side has `pdf-text.ts` (a port of `_page_text`: ASCII85 per Python 3.11 `a85decode(adobe=True)`, `DecompressionStream('deflate')`, and the Tj/Tm regexes with Python byte-regex semantics), `fields.ts`, `classify.ts`, `transcript.ts`, `parse.ts` (no LLM branch) and `parity.test.ts`. The Marcus account transcript matched end to end on the first run.
- **Task 2, `1555bad`.** All parser families are ported: pay-stub, bank-statement, housing (lease, mortgage, utility), vehicle (auto, valuation, combineAutos), accounts (health, retirement, life, investment) and business. `parse.ts` dispatches to them. The fixture now covers 24 test texts and all 26 example PDFs.
- **Task 3, `1b10ec4`.** `merge.ts` ports `merge_documents`, `_apply_income`, `_covered_by_stub`, `_sum_amounts` and `_sum_present`. The fixture gains 7 merge cases and 3 packets. `--check` was confirmed to exit 1 after one number in `golden-extract.json` was changed by hand, and to exit 0 after regenerating.

## Fixture case counts (golden-extract.json)

| Section | Count | Notes |
|---------|-------|-------|
| texts_cases | 24 | 13 from `test_general_forms_and_document_type_hints`, 11 from `test_upload_categories_fill_case_columns`; 1 is the expected error `No template matched document` |
| merge_cases | 7 | from 4 tests |
| pdfs | 26 | every `examples/*/*.pdf`; all parse; page text plus rows compared |
| packets | 3 | one per `examples/*` folder |

The parity test has 61 cases, all green. `pnpm -C app run check` exits 0, with 1202 tests passing. `python -m unittest discover -s src/tests` passes (41 tests). `check-file-sizes` passes; the largest new code file is `fields.ts` at 182 lines.

## Python behavior that needed a port note

- `re.finditer(rb"stream\r?\n")` also matches inside `endstream\n`. The port scans the same way, and when there is no `endstream` the body ends one byte before the end of the file, like `data[start:-1]`.
- `TextDecoder('latin1')` is really windows-1252, so the port decodes bytes by hand. Python bytes `.` and `\s` differ from JS `.` and `\s`, so the port uses explicit character classes. `str.strip()`, `str.split()` and `\b` follow Python's Unicode rules.
- `Decimal` arithmetic is ported as exact bigint decimals. `_to_monthly` and the wage and unexplained-deposit divisions round half up. `tax_only_balance` uses the context default, ROUND_HALF_EVEN. Exact rational rounding differs from Decimal's 28-digit context only within 1e-26 of a half-cent tie (noted as a shortcut in code).
- A bare `next()` (StopIteration) becomes `No template matched <label>`.
- Kind `bankruptcy` with blank text raises `KeyError: 'bankruptcy'` in Python, because `_KIND_FIELDS` has no such entry. The port mirrors this as a plain `Error`.
- A bank statement without `Account Number:` or a `Description` column raises `KeyError` in Python. The port throws a plain `Error`, not `ExtractError`.
- `_apply_income` grows `employers` inside its wage loop. The port keeps that order dependence.
- `_period_end` is a `date` in Python. The fixture and the TS port both use the ISO text, which sorts the same way.

## Git state of the oracle at export time

`src/document_parse.py` and `src/tests/test_document_parse.py` were clean (committed). `git diff --quiet f30c23b -- src/document_parse.py src/tests/` passes. `git hash-object` returns `9f4f0b70…` and `70fec944…`, unchanged before and after.

## Deviations from Plan

1. **[Rule 3 - Blocking/approach] Test inputs are recorded, not hand-copied.** The plan said to copy each test's `parse_texts` and `merge_documents` inputs as literal data. Instead, `golden_extract._test_calls()` runs `test_document_parse` with recording wrappers at export time. Calls made while `urlopen` is patched (the mocked-model tests) are skipped. The JSON still holds the inputs as literal data, they cannot drift from the tests, and outputs come from the oracle with the LLM off. One side effect: a test that fails under the disabled model before it reaches its regex calls contributes nothing after that point. The loose-bank merge in `test_failed_parse_asks_only_for_that_documents_columns` is one such call.
2. **[Rule 2] Optional `label` on `parsePdf`.** `parsePdf(bytes, documentType, label = 'document')` reproduces Python's `str(path)` in error text. The fixture calls `_parse_document(texts, rows, None, rel_posix)` so the messages do not depend on the machine. The interface stays compatible.
3. **Base commit.** The worktree HEAD at start was `4812d4e`, a descendant of `f30c23b`. The plan ledger file was not written because a compound git command was refused, so `plan_head_before` is set to `4812d4e` by hand. `git rev-list --count 4812d4e..HEAD` gives 3 before this SUMMARY commit.
4. Running the exporter rewrites `golden.json` with LF line endings. That shows as a CRLF-only working-tree change with no content diff, so it was restored with `git checkout --` and not committed.

## Known Stubs

None.

## Threat Flags

None. No new network, auth or storage surface. `pageText` takes untrusted bytes; streams that fail to decode are skipped (T-07-45). Plan 12 still has to cap document size and count before calling it.

## Self-Check: PASSED

- All 14 code and fixture files and the 15 docs exist.
- Commits `b98947f`, `1555bad` and `1b10ec4` are ancestors of HEAD.
- `python src/tools/export_golden_fixtures.py --check` exits 0, and `pnpm -C app run check` exits 0.
