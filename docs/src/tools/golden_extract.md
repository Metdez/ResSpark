# `src/tools/golden_extract.py`

Builds `app/worker/test/fixtures/engine/golden-extract.json`, the oracle fixtures for the TypeScript extractors in `app/worker/src/extract/` (Plan 07-11, D-17). `src/tools/export_golden_fixtures.py` imports it, writes the file next to `golden.json`, and includes it in `--check`. Stdlib only; it never edits anything under `src/`.

## Parts, in file order

| Part | What it does |
|------|--------------|
| `SRC`, `ROOT`, `sys.path` | Resolve `src/` and the repo root from the file location and put `src/` and `src/tests/` on the import path. |
| `_llm_disabled` and the two assignments after `import document_parse` | **Privacy guard (T-07-46, T-07-47).** `document_parse._load_env` becomes a no-op, so `.env` is never read, and `document_parse._llm_json` raises `RuntimeError("llm_disabled")`, so no request reaches OpenRouter. This runs at import, before any parse. `_parse_document` then re-raises the template's original `ValueError`, exactly as when the model is unavailable, which is the behavior the TS port reproduces. |
| `_URLOPEN` | The real `urlopen`, kept to recognize tests that patch it (used when capturing test inputs). |
| `_plain(value)` | Makes oracle output JSON-safe: `date` becomes `isoformat()` text and tuples become lists. |
| `_rows(rows)` | Turns the `_page_text` rows dict into `[y, [[x, text], …]]` in insertion order. |
| `_outcome(call)` | Runs one parse: `{"expected": …}` on success, `{"error": str(ValueError)}` on a template failure. Any other exception stops the export so it gets noticed. |
| `pdf_case(path)` | One `pdfs` entry: repo-relative `path` with forward slashes, `document_type: null`, `page_text` from `_page_text`, and the parse. It calls `_parse_document(texts, rows, None, rel)`, which is `parse_pdf(path)` with a machine-independent label in error messages. |
| `_test_calls()` | Imports `src/tests/test_document_parse.py`, swaps that module's `parse_texts` and `merge_documents` for recording wrappers, runs every test (sorted by id, results discarded), and restores them. Each call is named `<test method>#<n>` (one counter per test for both functions). A `parse_texts` call made while `urlopen` is patched belongs to a mocked-model test and is skipped, so only regex cases remain. Inputs are deep-copied before the call because `merge_documents` pops `_kind`. The test inputs are therefore copied as data at export time and stay in step with the tests. |
| `_flatten(suite)` | Flattens nested `unittest` suites into test cases. |
| `texts_cases(calls)` | One entry per recorded call: `name`, `texts`, `rows`, `document_type`, and the oracle's outcome recomputed with the LLM off. |
| `merge_cases(calls)` | One entry per recorded `merge_documents` call: `name`, `parts` (JSON-safe) and `expected`, the oracle's merge of a fresh deep copy. |
| `packet_cases()` | One entry per `examples/*` folder: `dir` (repo-relative) and `expected`, the oracle's `parse_packet` of that folder. |
| `build_extract_payload()` | The file: `python` (major.minor), `generated_by`, `texts_cases`, `merge_cases`, `pdfs` (every `examples/*/*.pdf`, sorted), `packets`. |

## Regenerating

```powershell
python src/tools/export_golden_fixtures.py          # writes golden.json and golden-extract.json
python src/tools/export_golden_fixtures.py --check  # exit 1 if either is stale
```

The fixtures reflect `src/document_parse.py` and `src/tests/test_document_parse.py` as they are in the working tree at export time, not as committed. `pnpm check` runs `--check`, so an oracle or test edit that changes any output fails the gate until the fixture is regenerated (a hand edit of the JSON fails the same way).

After a deliberate change to `src/document_parse.py`: rerun the exporter with Python 3.11, commit the regenerated `golden-extract.json` with the Python change, run `pnpm -C app exec vitest run --project worker-node worker/src/extract`, and fix the TypeScript port until it is green. Never loosen `toEqual`.

## Fixture contents (as generated)

24 `texts_cases` (13 from `test_general_forms_and_document_type_hints`, 11 from `test_upload_categories_fill_case_columns`; one is an expected `No template matched document` error), 7 `merge_cases`, 26 `pdfs` (every example PDF; all parse) and 3 `packets`. A test that fails under the disabled model before reaching its regex calls (for example the bank-sum merge in `test_failed_parse_asks_only_for_that_documents_columns`) contributes nothing from the point it fails.
