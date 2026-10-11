# `src/tools/export_golden_fixtures.py`

The oracle exporter (D-03, FORM-01). The Python engine in `src/` is the source of truth for the TypeScript port in `app/worker/src/engine/`. This script imports the **unchanged** Python modules, runs every fixture case through `evaluate_case` with a recording standards repository, and writes `app/worker/test/fixtures/engine/golden.json`. `app/worker/src/engine/parity.test.ts` then requires the TS engine to reproduce every case exactly. The script never edits anything under `src/`; `golden.json` is generated and must not be hand-edited.

Stdlib only. Run from the repo root (or anywhere; paths come from `__file__`):

```powershell
python src/tools/export_golden_fixtures.py
```

## Parts, in file order

| Part | What it does |
|------|--------------|
| `SRC`, `ROOT`, `OUT`, `sys.path` | Resolve `src/`, the repo root and the output path from the script location, then put `src/` and `src/tests/` first on the import path so the real modules and the test fake are imported. |
| imports | `_NEXT`/`_PATHS` from `case_api`, `INITIAL_QUESTION_IDS`/`REQUIRED_FINANCIAL_COLUMNS`/`evaluate_case` from `intake_workflow`, `QUESTIONS`, and `FakeStandardsRepository`/`canonical_zero_row` from `src/tests/test_intake_workflow.py`. Imported, never copied, so fixture data cannot drift from the tests (RESEARCH Pattern 2). |
| `INT_COLUMNS` | The integer columns (`household_size`, `dependents_count`, ages, `vehicle_count`, `csed_months_remaining`, `oic_payment_months`). |
| `Recorder` | Wraps a repository; every method call appends `{method, args, value}` in order and returns the inner value. The TS replay fake consumes this sequence and throws on anything else, which proves the port makes the same lookups in the same order (for example, `transportation_area` only when there is a vehicle, both health-care ages every time). |
| `_row(**updates)`, `FL` | A `canonical_zero_row()` with updates applied; the Florida/Miami-Dade residence the tests use. |
| `existing_test_cases()` | One case per scenario in `src/tests/test_intake_workflow.py` and `src/tests/test_case_api.py`, rows built the same way the test builds them, named `test_<method name>` (the renter half of the document-request test is `..._renter`). |
| `_check_row(name, row)` | Refuses inputs JSON cannot carry faithfully: any `-0.0` (Vitest `toEqual` tells `-0` from `0`) and any non-`int` value in an integer column (JSON would turn `3.0` into `3`). |
| `build_case(name, row)` | Runs `evaluate_case(row, Recorder(FakeStandardsRepository()))` and stores `expected` (status, missing ids and fields, review flags, document requests as dicts, `determination` as a dict or `null`) and the recorded `standards_calls`. |
| `build_payload()` | The top-level object: `python` (major.minor), `generated_by`, `questions` (id, prompt, Python type name), `initial_question_ids`, sorted `required_financial_columns`, `paths` (`_PATHS` as lists), `next`, and `cases`. |
| `render(payload)` | `json.dumps(indent=2, ensure_ascii=False)` plus a trailing newline. Insertion order is deterministic, so two runs write byte-identical files. |
| `main()` | **Version guard first:** if `sum([0.1] * 10) == 1.0` the interpreter uses compensated summation (Python 3.12+), which changes last-bit float totals; the script exits 1 with "Golden fixtures need left-to-right float sum (Python <= 3.11); the TS engine mirrors that." Then writes the file with LF line endings. |

## Regenerating after a Python change

Any change to `src/determination.py`, `src/intake_workflow.py`, `src/questions.py`, `src/case_api.py` wording or the test fake changes the oracle. Rerun the script, then run the parity test; if it fails, fix the TypeScript port (never loosen the assertion).
