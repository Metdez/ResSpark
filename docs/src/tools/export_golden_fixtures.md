# `src/tools/export_golden_fixtures.py`

The oracle exporter (D-03, FORM-01). The Python engine in `src/` is the source of truth for the TypeScript port in `app/worker/src/engine/`. This script imports the **unchanged** Python modules, runs every fixture case through `evaluate_case` with a recording standards repository, and writes `app/worker/test/fixtures/engine/golden.json`. `app/worker/src/engine/parity.test.ts` then requires the TS engine to reproduce every case exactly. The script never edits anything under `src/`; `golden.json` is generated and must not be hand-edited.

Stdlib only. Run from the repo root (or anywhere; paths come from `__file__`):

```powershell
python src/tools/export_golden_fixtures.py          # write golden.json
python src/tools/export_golden_fixtures.py --check  # exit 1 if golden.json is stale
```

## Parts, in file order

| Part | What it does |
|------|--------------|
| `SRC`, `ROOT`, `OUT`, `sys.path` | Resolve `src/`, the repo root and the output path from the script location, then put `src/` and `src/tests/` first on the import path so the real modules and the test fake are imported. |
| imports | `_NEXT`/`_PATHS` from `case_api`; `calculate_allowable_expenses`/`calculate_net_realizable_equity` from `determination`; `FinancialData`; `INITIAL_QUESTION_IDS`, `REQUIRED_FINANCIAL_COLUMNS`, `evaluate_case`, `financial_data_from_case_row`, `validate_answer` from `intake_workflow`; `QUESTIONS`; and `FakeStandardsRepository`/`canonical_zero_row` from `src/tests/test_intake_workflow.py`. Imported, never copied, so fixture data cannot drift from the tests (RESEARCH Pattern 2). |
| `INT_COLUMNS`, `QUESTION_ONLY_COLUMNS`, `VALIDATION_SAMPLES`, path constants | The integer columns; the five question ids that are not `FinancialData` fields (`pay_frequency` and four `has_*` flags); the answer samples `True, 1, 2.5, "weekly", None`; and the path strings the coverage check names. |
| `Recorder` | Wraps a repository; every method call appends `{method, args, value}` in order and returns the inner value. The TS replay fake consumes this sequence and throws on anything else, which proves the port makes the same lookups in the same order (for example, `transportation_area` only when there is a vehicle, both health-care ages every time). |
| `_require(condition, message)` | Raises `ValueError`; used instead of `assert` so the checks also run under `python -O`. |
| `_row(**updates)`, `FL` | A `canonical_zero_row()` with updates applied; the Florida/Miami-Dade residence the tests use. |
| `existing_test_cases()` | One case per scenario in `src/tests/test_intake_workflow.py` and `src/tests/test_case_api.py`, rows built the way the test builds them, named `test_<method name>` (the renter half of the document-request test is `..._renter`). 12 cases. |
| `INCOME_FIELDS`, `EXPENSES`, `ASSETS`, `PAYING` | Inputs for the grid: the 11 Box D income fields; one amount per actual-expense field (housing above the $3,000 fake standard, vehicle costs with no vehicle, …); asset scenarios above and below each line's rule (negative investments, an underwater retirement loan, other assets below and above the $11,980 deduction); and a paying wage-earner base row. |
| `grid_cases()` | Plain loops, no randomness: household 1-6 × vehicles 0-3 (24 rows: married from 2 people, joint offer on even vehicle counts, owner/renter alternating, vehicle actuals above and below the fake standards, per-vehicle lists with a shorter loan list on odd counts and legacy totals on even counts, a public-transport expense on every row so the "no vehicle" rule is exercised); four spouse-age pairs around 65; each income field alone; each expense field alone; each asset scenario; both compliance reasons alone and together; each review flag alone and all together; and one row per payment path (simple plan, non-simple installment, manual payment). |
| `boundary_cases()` | Pairs on each side of a threshold: NRE 500 / 500.01, owed 50,000 / 50,000.01, CSED 0 / 1 (and negative), taxpayer age 64 / 65, joint offer vs single with two vehicles as a per-vehicle list and as legacy totals, a one-vehicle legacy joint offer (exemption capped at `vehicle_count`), and a one-person household with two seniors (negative under-65 count). |
| `other_cases()` | `pay_frequency_not_applicable` (a non-wage earner whose `pay_frequency` is `'not_applicable'`, RESEARCH open question 2), then one `null_<column>` case per required column and per question-only column. |
| `_check_row(name, row)` | Refuses inputs JSON cannot carry faithfully: any `-0.0` (Vitest `toEqual` tells `-0` from `0`) and any non-`int` value in an integer column (JSON would turn `3.0` into `3`). |
| `nre_lines(fd)` | The seven Section 3 terms, expressions copied from `src/determination.py:92-113` (Python has no per-line function). It requires their in-order sum to equal `calculate_net_realizable_equity(fd)`, so a change to the Python formula breaks the exporter instead of silently diverging. |
| `build_case(name, row)` | Runs `evaluate_case` with a fresh `Recorder` and stores `expected` (status, missing ids and fields, review flags, document requests as dicts, `determination` as a dict or `null`) and `standards_calls`. For cases past `information_needed` it also stores `allowable_breakdown` (computed with a second recorder, which must make exactly the same calls, so the TS test can replay one sequence for both) and `nre_lines`. |
| `_check_coverage(cases)` | Proves the grid still lands where it claims: the NRE, owed and CSED boundaries take the named paths; ages 64/65 give out-of-pocket 90/163; joint offers exempt the second vehicle; `pay_frequency_not_applicable` is evaluated; every `null_*` case is `information_needed` and lists its column. |
| `validations()` | Every question × every sample, with Python's accept/reject and `TypeError` message. |
| `standards_samples()` | A descriptive snapshot of what the fake returns (national 1-8, health 30/64/65, ownership and operating 0-3, housing). The tests replay recorded calls, not this table. |
| `build_payload()` | Builds all cases (existing, grid, boundary, other), checks coverage, and returns the top-level object: `python` (major.minor), `generated_by`, `questions` (id, prompt, Python type name), `initial_question_ids`, sorted `required_financial_columns`, `paths` (`_PATHS` as lists), `next`, `validations`, `standards`, `cases`. |
| `render(payload)` | `json.dumps(indent=2, ensure_ascii=False)` plus a trailing newline. Insertion order is deterministic, so two runs write byte-identical files. |
| `main(args)` | **Version guard first:** if `sum([0.1] * 10) == 1.0` the interpreter uses compensated summation (Python 3.12+), which changes last-bit float totals; the script exits 1 with "Golden fixtures need left-to-right float sum (Python <= 3.11); the TS engine mirrors that." Any argument other than a single `--check` prints the usage and exits 2. Without arguments it writes the file with LF line endings. With `--check` it builds the payload in memory and compares it, parsed, with the file on disk (a parsed compare survives a CRLF checkout); a missing or different file prints "golden.json is stale: run python src/tools/export_golden_fixtures.py" and exits 1. |

## Fixture contents (as generated with Python 3.11)

12 existing-test cases, 69 `grid_*`, 15 `boundary_*`, 1 `pay_frequency_not_applicable`, 63 `null_*` (58 required columns + 5 question-only), 140 validations. Every one of the six paths appears.

## How freshness is enforced

`app/package.json` runs `python ../src/tools/export_golden_fixtures.py --check` inside `pnpm check`, right after the file-size gate (cwd is `app/`; the script resolves its own paths from `__file__`). A Python change that alters any output, or a hand edit of `golden.json`, fails `pnpm check` until the fixture is regenerated. `parity.test.ts` then compares the TS engine against the regenerated file with `toEqual` (threat T-07-01).

`app/package.json` also defines `test:live:file` (`dotenv` with the same env files as `test:live`, then `vitest run --project worker-node`), so later plans run one live file with `pnpm -C app test:live:file worker/test/<file>` without naming env files on the command line.

## Regenerating after a Python change

Any change to `src/determination.py`, `src/intake_workflow.py`, `src/questions.py`, `src/case_api.py` wording or the test fake changes the oracle. Rerun the script (Python 3.11), commit the regenerated `golden.json` together with the Python change, then run the parity test; if it fails, fix the TypeScript port (never loosen the assertion) and bump `ENGINE_VERSION` in `app/worker/src/engine/outcome.ts` if the port's behavior changed.
