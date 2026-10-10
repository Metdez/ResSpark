---
last_mapped_commit: ba83e4e43838595a38647e26882014745b62d476
last_mapped_at: 2026-10-10
---
# Coding Conventions

**Analysis Date:** 2026-10-10

## Naming Patterns

**Files:**
- Python modules: lowercase snake_case, one concern per module: `src/intake_workflow.py`, `src/standards_repository.py`, `src/case_api.py`, `src/document_parse.py`.
- Python tests: `src/tests/test_<module>.py` (for example `src/tests/test_case_api.py`).
- TypeScript modules: kebab-case: `src/frontend/src/case-processing.ts`, `src/frontend/src/resolution-results/model.ts`, `src/frontend/src/document-upload/requests.ts`.
- TypeScript tests are co-located beside the module they cover: `src/frontend/src/case-processing.test.ts`, `src/frontend/src/document-upload/screen.test.ts`.
- Generated data is marked by name: `src/frontend/src/counties.generated.ts` (produced by `src/frontend/scripts/generate-counties.mjs`; do not hand-edit).
- SQL: `src/schemas/database_schema.sql`, `src/schemas/lookup_standards.seed.sql`.

**Python functions and variables:**
- snake_case throughout: `calculate_gross_monthly_income()` in `src/determination.py`, `parse_uploads()` in `src/document_parse.py`.
- Private helpers are prefixed with a single underscore: `_is_applicable()` and `_REQUESTS` in `src/intake_workflow.py`, `_sum_amounts()` and `_llm_json()` in `src/document_parse.py`.
- Module-level constants are UPPER_SNAKE_CASE: `QUESTION_BY_ID`, `REQUIRED_FINANCIAL_COLUMNS`, `INITIAL_QUESTION_IDS` in `src/intake_workflow.py`, `_MAX_BODY` in `src/case_api.py`.
- Field names mirror the database columns in `case_financial_data` (snake_case): `actual_housing_utilities`, `gross_wages_taxpayer`, `vehicle_count`. Keep Python field names and SQL column names identical.

**Python types:**
- Classes are PascalCase: `FinancialData`, `DocumentRequest`, `WorkflowResult`, `PostgresStandardsRepository`, `StandardsLookupError`.
- Protocols are used for the injected dependency contract: `StandardsRepository` in `src/standards_repository.py`.

**TypeScript:**
- Functions and variables: camelCase (`processCase`, `renderDocumentUpload`, `isCaseResult`).
- Types and interfaces: PascalCase (`SelectedDocument`, `CaseSubmission`, `CaseProcessor`, `ResolutionCaseResult`).
- Type guards are arrow functions named `isX` returning `value is T`: `isObject` and `isCaseResult` in `src/frontend/src/case-processing.ts`.
- API payloads use camelCase keys (`categoryLabel`, `reviewNotes`, `financialSections`) while Python emits the same keys. Form field names keep snake_case (`answers`, `document_metadata`).
- DOM hooks use data attributes, not classes: `data-document-code`, `data-document-request`, `data-request-status`, `data-slot-file`. Keep this pattern for test selectors.

## Code Style

**Formatting:**
- No Prettier or Biome config is present in the repository. Formatting is manual.
- Observed style: 4-space indent in Python, 2-space indent in TypeScript (`src/frontend/src/case-processing.ts`), double quotes in TypeScript, trailing semicolons in TypeScript.
- Python lines are long in places (up to about 120 characters in `src/determination.py` and `src/intake_workflow.py`). Match the surrounding file rather than reflowing.

**Linting and type checking:**
- No ESLint or Ruff/Flake8 config is present.
- TypeScript strict mode is the enforced check: `src/frontend/tsconfig.json` sets `"strict": true`, `"noEmit": true`, `"isolatedModules": true`. The build script runs `tsc --noEmit` before `vite build` (`src/frontend/package.json`).
- Python uses full type hints on function signatures (about 122 `->` annotations across `src/*.py`). Use `X | None` and `list[dict]`, `tuple[...]`, not `Optional`/`List`/`Tuple`.
- `from __future__ import annotations` is used in `src/intake_workflow.py`, `src/case_api.py`, `src/standards_repository.py`, and `src/tests/test_case_api.py`. Add it to new modules that use forward references.

## Data Modelling

**Python:**
- Use `@dataclass` for value objects. Use `frozen=True` for immutable records: `DocumentRequest` in `src/intake_workflow.py`. Use `field(default_factory=list)` for mutable defaults: `WorkflowResult` in `src/intake_workflow.py`.
- `FinancialData` in `src/financial_data.py` is the canonical fact container. Its dataclass fields define the required columns (`REQUIRED_FINANCIAL_COLUMNS` is derived from `FinancialData.__dataclass_fields__`).
- Distinguish unknown from zero. Use `None` for unknown and `0` for known-zero. Required unknowns must block evaluation (see `missing_financial_columns()` in `src/intake_workflow.py`). Never default a required value silently.

**TypeScript:**
- Use `interface` for object shapes (`CaseSubmission`, `SelectedDocument` in `src/frontend/src/case-processing.ts`) and `type` for unions and function types (`CaseProcessor`).
- Validate every API response at the boundary with a type guard before use (`isCaseResult` in `src/frontend/src/case-processing.ts`). Do not cast untrusted JSON to a type.

## Import Organization

**Python order (observed in `src/intake_workflow.py`):**
1. Module docstring.
2. `from __future__ import annotations`.
3. Standard library (`collections.abc`, `dataclasses`, `decimal`, `pathlib`, `sys`, `unittest`).
4. Local modules, imported by bare name because `src/` is the import root: `from determination import ...`, `from financial_data import FinancialData`.

**Test modules** add `src/` to `sys.path` before local imports:

```python
SRC = Path(__file__).resolve().parents[1]
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
```

Use this exact guard in new test files (`src/tests/test_intake_workflow.py`, `src/tests/test_case_api.py`).

**TypeScript:**
- `import type` for type-only imports (`import type { Answers } from "./questions";` in `src/frontend/src/case-processing.ts`).
- Relative imports only. No path aliases are configured in `src/frontend/tsconfig.json`.
- No barrel `index.ts` files exist; import from the module file directly.

## Error Handling

**Python:**
- Domain errors subclass the built-in: `StandardsLookupError(LookupError)` in `src/standards_repository.py`. Raise `ValueError` for bad input (`"answers must be a JSON object."` in `src/case_api.py`).
- Convert low-level errors with `from error` chaining: `raise LookupError("Install psycopg to look up IRS standards.") from error` in `src/case_api.py` and `src/demo.py`.
- Import of optional dependencies (`psycopg`) is wrapped in `try/except ImportError` and re-raised as a clear runtime message.
- The HTTP handler in `src/case_api.py` maps `ValueError` to 400 and `LookupError` to a 503-style response. Keep this split: input problems are `ValueError`, missing standards are `LookupError`.
- Catch-all `except Exception` is used only at the outer HTTP boundary in `src/case_api.py`. Do not add new broad catches in calculation code.
- Known lossy shortcuts are annotated with the `ponytail:` marker in comments, for example `# ponytail: whole body is read into memory` in `src/case_api.py` and the module docstring of `src/document_parse.py`.

**TypeScript:**
- Network failures become thrown `Error`s with the HTTP status in the message: `Case submission failed (503).` in `src/frontend/src/case-processing.ts`.
- Malformed responses throw `Error("... invalid result")`, not silent fallbacks.
- Test assertions use `rejects.toThrow(...)` to verify these messages.

## Logging

**Framework:** None. Use `print(..., flush=True)` for CLI output only.

**Patterns:**
- Startup message in `src/case_api.py` and scenario output in `src/demo.py` use `print`. Do not add `print` to calculation modules (`src/determination.py`, `src/intake_workflow.py`).
- Errors are surfaced to the caller through exceptions and returned `review_flags` / `review_notes` lists, not logged.

## Comments and Docstrings

**When to Comment:**
- Module docstrings explain purpose and the boundary the module owns (see `src/determination.py`, `src/standards_repository.py`).
- Cite the authority for any IRS rule in a comment. `src/determination.py` cites Form 433-A(OIC) line items and the $1,000 bank reserve and $3,450 vehicle exemption. Any new rule must carry the same kind of citation (see `AGENTS.md`).
- Section banners separate pipeline steps in `src/determination.py`: `# ---...` followed by `# STEP 1 — ...`.
- Use `ponytail:` prefixed comments to flag a known shortcut and its upgrade trigger.

**Docstrings:**
- Python functions use one-line docstrings with input/output description: `"""Input: FinancialData. Output: total monthly household income (Box D)."""` in `src/determination.py`.
- TypeScript uses JSDoc only where behavior is non-obvious. Most exported functions rely on types.

## Function Design

- Keep functions small and single-purpose. Pipeline steps in `src/determination.py` each compute one value.
- Pass dependencies explicitly. Standards are injected as a `StandardsRepository` argument (`calculate_allowable_expenses(fd, standards_repository)`), never imported as a global connection.
- Prefer returning dataclasses or dicts with a `total` key over tuples. Existing examples: `calculate_allowable_expenses()` returns a dict including `'total'`.
- Private helpers sit below the public function that uses them in the same module.

## Module Design

- **Pure calculation:** `src/determination.py` and `src/financial_data.py` must not do I/O, LLM calls, or heuristics. Keep them deterministic.
- **Layering:** intake (`src/intake_workflow.py`) gathers and validates; `FinancialData` represents facts; determination calculates; standards come from the repository (`src/standards.py`, `src/standards_repository.py`).
- **Standards:** no IRS amounts in Python. Add them to `src/schemas/lookup_standards.seed.sql` and read through the repository with parameterized queries (`PostgresStandardsRepository._one` in `src/standards_repository.py`).
- **Question contract:** `src/questions.py` defines exactly 32 intake questions. Changing applicability requires updating `src/intake_workflow.py` and its tests together.
- **Frontend modules:** each screen lives in its own folder with `screen.ts` (rendering), `requests.ts` (data), and `screen.test.ts`. Example: `src/frontend/src/document-upload/`.
- **Exports:** named exports only (`export const processCase`, `export function renderDocumentUpload`). No default exports were found.

## Size Limits (from CLAUDE.md and AGENTS.md)

- Project rule: no code file over 500 lines. Split by concern before crossing it.
- Current violations:
  - `src/document_parse.py` is 954 lines. Split it by document kind (for example, a `document_parse/` package with the `_account_transcript`, `_pay_stub`, `_lease`, and `_auto` parsers, plus a classifier module). Do this before adding parsers.
  - `src/frontend/src/counties.generated.ts` is 3324 lines, but it is generated. It is exempt; keep it generated.
- Test files over 500 lines also count. `src/tests/test_document_parse.py` is 558 lines and should be split by document kind.

## Companion Documentation (from CLAUDE.md and AGENTS.md)

- Each new code file needs a companion Markdown file in `docs/`, mirroring the source path.
- Current state: only `docs/src/frontend/src/supabase/client.md` exists. Companion docs are missing for `src/*.py`, the other frontend modules, and the tests. Add them when touching those files.
- Explanations belong in the Markdown file, not in long code comments.

## Project-Specific Rules

- Use TypeScript for all frontend code (`AGENTS.md`). Do not add `.js` source files under `src/frontend/src/`. The only JavaScript is the build helper `src/frontend/scripts/generate-counties.mjs`.
- Standard-library Python first. No new runtime Python dependencies unless the task requires one. `psycopg` is the only database driver and is imported lazily.
- Never print or commit `.env` values. Read configuration through `os.environ` (see `_load_env()` in `src/document_parse.py`).

---

*Convention analysis: 2026-10-10*
