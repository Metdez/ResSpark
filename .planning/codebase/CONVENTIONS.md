# Coding Conventions

**Analysis Date:** 2026-09-27

## Naming Patterns

**Files:**
- Use lowercase `snake_case.py` for Python modules and `test_<module>.py` for Python tests, as in `src/intake_workflow.py`, `src/standards_repository.py`, and `src/tests/test_intake_workflow.py`.
- Use lowercase kebab-separated names for multiword TypeScript feature files and co-locate tests with the implementation using `<name>.test.ts`, as in `src/frontend/src/case-processing.ts`, `src/frontend/src/case-processing.test.ts`, and `src/frontend/src/document-upload/requests.test.ts`.
- Keep a feature's model, rendering code, styles, and tests in its own directory when it has a distinct UI boundary; follow `src/frontend/src/resolution-results/model.ts`, `src/frontend/src/resolution-results/screen.ts`, and `src/frontend/src/resolution-results/screen.test.ts`.
- Treat `src/frontend/src/counties.generated.ts` as generated output. Regenerate it with `src/frontend/scripts/generate-counties.mjs`; do not edit the generated file by hand.

**Functions:**
- Use `snake_case` for Python functions, with a leading underscore for module-private helpers: `evaluate_case` and `_review_flags` in `src/intake_workflow.py`, `_llm_json` and `_coerce_field` in `src/document_parse.py`.
- Use `camelCase` for TypeScript functions and callbacks: `getApplicableQuestions` in `src/frontend/src/flow.ts`, `renderDocumentUpload` in `src/frontend/src/document-upload/screen.ts`, and `renderResolutionResults` in `src/frontend/src/resolution-results/screen.ts`.
- Name renderers with a `render` prefix, validators with `validate`, predicates with `is`/`has`, and event-independent selectors with `get`, following `renderFinancialSections` in `src/frontend/src/resolution-results/screen.ts`, `validateAnswer` in `src/frontend/src/flow.ts`, `isCaseResult` in `src/frontend/src/case-processing.ts`, and `getDocumentRequests` in `src/frontend/src/document-upload/requests.ts`.

**Variables:**
- Use `snake_case` in Python and `camelCase` in TypeScript. Canonical financial keys remain `snake_case` across the Python/JSON/browser boundary, as shown by `gross_wages_taxpayer` in `src/financial_data.py`, `src/case_api.py`, and `src/frontend/src/questions.ts`.
- Use uppercase `SNAKE_CASE` for Python module constants (`REQUIRED_FINANCIAL_COLUMNS` in `src/intake_workflow.py`, `_TEXT_LIMIT` in `src/document_parse.py`) and for TypeScript configuration constants (`DRAFT_KEY` in `src/frontend/src/app.ts`).
- Prefix implementation-only Python values with `_`, including `_REQUESTS` in `src/intake_workflow.py` and `_CHAT_URL` in `src/document_parse.py`; do not expose them as public API without a deliberate interface change.

**Types:**
- Use PascalCase for Python dataclasses, protocols, exceptions, and test cases: `FinancialData` in `src/financial_data.py`, `StandardsRepository` and `StandardsLookupError` in `src/standards_repository.py`, and `CaseApiTests` in `src/tests/test_case_api.py`.
- Use PascalCase for TypeScript interfaces and type aliases: `QuestionDefinition` in `src/frontend/src/questions.ts`, `CaseProcessor` in `src/frontend/src/case-processing.ts`, and `ResolutionCaseResult` in `src/frontend/src/resolution-results/model.ts`.
- Model closed state sets with string-literal unions rather than free-form strings, following `Screen` in `src/frontend/src/app.ts`, `ValueType` in `src/frontend/src/questions.ts`, and `ResolutionPathId` in `src/frontend/src/resolution-results/model.ts`.

## Code Style

**Formatting:**
- No automated formatter configuration is present in the repository root or `src/frontend/`; preserve the established formatting in neighboring files such as `src/intake_workflow.py` and `src/frontend/src/flow.ts`.
- Python uses four-space indentation, blank lines between top-level definitions, double-quoted user-facing strings, and parenthesized multiline expressions, as in `src/determination.py` and `src/standards_repository.py`.
- TypeScript uses two-space indentation, double quotes, semicolons, and trailing commas in multiline parameter and object lists, as in `src/frontend/src/flow.ts` and `src/frontend/vitest.config.ts`.
- Keep TypeScript compatible with the strict, no-emit compiler settings in `src/frontend/tsconfig.json`; explicitly type public parameters and return values, and avoid implicit `any`.
- Use `Decimal` at Python rounding/aggregation boundaries and convert to `float` at the data/API edge, following `_whole_dollars` in `src/determination.py` and `_sum_amounts` in `src/document_parse.py`.

**Linting:**
- No ESLint, Ruff, Flake8, Black, Prettier, or Biome configuration is detected in the repository or `src/frontend/`. Use `python -m unittest discover -s src/tests -v` and the strict TypeScript check in `npm run build` from `src/frontend/package.json` as the current automated quality gates.
- Do not introduce a runtime dependency merely for style. The contributor constraints in `AGENTS.md` prefer standard-library Python, while frontend dependencies and scripts are declared in `src/frontend/package.json`.
- Keep intentionally ignored callback arguments named with a leading underscore, following `_label` in the parameterized cases in `src/frontend/src/document-upload/requests.test.ts`.

## Import Organization

**Order:**
1. Put Python future imports first, then standard-library imports, then a blank line, then local modules, following `src/case_api.py` and `src/intake_workflow.py`.
2. Put TypeScript third-party or side-effect imports first, then a blank line, then relative application imports, following `src/frontend/src/app.ts` and `src/frontend/src/app.test.ts`.
3. Use `import type` (or inline `type`) for type-only TypeScript dependencies, as in `src/frontend/src/case-processing.ts` and `src/frontend/src/document-upload/screen.ts`.

**Path Aliases:**
- No path aliases are configured in `src/frontend/tsconfig.json`. Use relative imports such as `../questions` and `./resolution-results/model`, following `src/frontend/src/document-upload/requests.ts` and `src/frontend/src/app.ts`.
- Python is a flat source tree rather than an installed package. Production modules import peers by bare module name, while tests add `src/` to `sys.path`, as shown in `src/tests/test_case_api.py` and `src/tests/test_intake_workflow.py`.

## Error Handling

**Patterns:**
- Raise narrow, meaningful exceptions at domain boundaries: `TypeError` for an answer of the wrong declared type in `src/intake_workflow.py`, `ValueError` for malformed documents or requests in `src/document_parse.py` and `src/case_api.py`, and `StandardsLookupError` for missing lookup data in `src/standards_repository.py`.
- Preserve the original cause when translating exceptions with `raise ... from error`, following the optional `psycopg` import in `src/case_api.py` and model-fallback errors in `src/document_parse.py`.
- Translate expected API input failures into structured responses at the boundary: `response_for` in `src/case_api.py` turns `ValueError` into HTTP 400 data, while unresolved standards become a reviewable result rather than an invented resolution path in `result_for_row` in `src/case_api.py`.
- Validate untrusted JSON at runtime even when a TypeScript interface exists. `isCaseResult` in `src/frontend/src/case-processing.ts` checks the response shape before returning `ResolutionCaseResult`.
- Catch only recoverable browser failures locally. `src/frontend/src/app.ts` tolerates disabled session storage, and `src/frontend/src/document-upload/screen.ts` restores the submit button and shows a user-facing message after submission failure.
- When a catch intentionally discards an error, keep the fallback explicit in adjacent code or a short comment, as in `loadDraft` and `saveDraft` in `src/frontend/src/app.ts` and `_classification_error` in `src/document_parse.py`.

## Logging

**Framework:** console output only; no logging framework is configured in `src/` or `src/frontend/`.

**Patterns:**
- Keep library and calculation modules silent. `src/determination.py`, `src/intake_workflow.py`, and `src/standards_repository.py` return values or raise exceptions instead of printing.
- Restrict `print` to executable entry points and demonstrations: startup output is in `main` in `src/case_api.py`, and scenario output is in `src/demo.py`.
- The frontend currently has no `console.*` calls in `src/frontend/src/`; communicate recoverable errors through rendered state, as in `src/frontend/src/document-upload/screen.ts`.

## Comments

**When to Comment:**
- Explain tax-law sources, high-risk thresholds, and why a formula differs from ordinary arithmetic near the calculation, following the line-specific comments in `src/determination.py` and field comments in `src/financial_data.py`.
- Explain non-obvious data-boundary decisions such as unknown versus zero, optional-together fields, or document classification behavior, following `src/intake_workflow.py`, `src/document_parse.py`, and `src/case_api.py`.
- Do not comment obvious control flow. Prefer names such as `missing_financial_columns` in `src/intake_workflow.py` and `requestIsComplete` in `src/frontend/src/document-upload/screen.ts`.
- Preserve the safety language and professional-review framing in user-facing code in `src/frontend/src/app.ts`, `src/frontend/src/resolution-results/screen.ts`, and `src/case_api.py`.

**JSDoc/TSDoc:**
- TypeScript does not use JSDoc/TSDoc in `src/frontend/src/`; interfaces and explicit signatures carry the contract in files such as `src/frontend/src/resolution-results/model.ts`.
- Python uses module docstrings for architectural context and concise function/class docstrings for public behavior, as in `src/financial_data.py`, `src/standards_repository.py`, and `src/intake_workflow.py`. Add docstrings when behavior or domain meaning is not evident from the signature.

## Function Design

**Size:** Use small pure functions for calculations, validation, classification, and formatting. Follow `calculate_gross_monthly_income` in `src/determination.py`, `validateAnswer` in `src/frontend/src/flow.ts`, and `formatBytes` in `src/frontend/src/resolution-results/screen.ts`. Larger orchestration/rendering functions remain at module boundaries, such as `result_for_row` in `src/case_api.py` and `renderDocumentUpload` in `src/frontend/src/document-upload/screen.ts`.

**Parameters:**
- Pass dependencies explicitly where deterministic tests need substitution: standards repositories enter `evaluate_case` in `src/intake_workflow.py`, and the case processor is injectable into `createApp` in `src/frontend/src/app.ts`.
- Use dataclasses or interfaces when several values form a coherent contract (`FinancialData` in `src/financial_data.py`, `DocumentUploadScreenOptions` in `src/frontend/src/document-upload/screen.ts`); use keyword arguments for high-cardinality Python domain objects in `src/demo.py` and tests in `src/tests/test_intake_workflow.py`.
- Accept read-only abstractions where mutation is unnecessary, such as `Mapping[str, object]` in `src/intake_workflow.py`, and use `unknown` before validation at external TypeScript boundaries in `src/frontend/src/case-processing.ts`.

**Return Values:**
- Return dataclasses for internal workflow/domain outcomes (`WorkflowResult` in `src/intake_workflow.py`, `Determination` in `src/determination.py`) and JSON-ready dictionaries only at the HTTP/document boundary in `src/case_api.py` and `src/document_parse.py`.
- Use `None`/`null` to mean unknown or absent and preserve explicit numeric zero as known data, enforced by `missing_financial_columns` in `src/intake_workflow.py` and its tests in `src/tests/test_intake_workflow.py`.
- Return explicit error text (`string | null`) for inline frontend validation in `src/frontend/src/flow.ts`; throw only for failed external operations or invalid external responses in `src/frontend/src/case-processing.ts`.

## Module Design

**Exports:**
- Python exposes public functions/classes without a leading underscore and keeps helpers/constants private with `_`, following `src/document_parse.py` and `src/case_api.py`.
- TypeScript uses named exports for public functions, interfaces, and models, as in `src/frontend/src/flow.ts`, `src/frontend/src/questions.ts`, and `src/frontend/src/resolution-results/model.ts`. Configuration files alone use default exports in `src/frontend/vite.config.js` and `src/frontend/vitest.config.ts`.
- Keep tax calculations deterministic and separate from parsing, UI, or LLM behavior: `src/determination.py` depends on `FinancialData` and the standards interface, while model fallback remains in `src/document_parse.py`.

**Barrel Files:**
- No barrel (`index.ts`) export files are used in `src/frontend/src/`. Import directly from the owning module, as `src/frontend/src/app.ts` does for `flow`, `questions`, document upload, case processing, and results rendering.

---

*Convention analysis: 2026-09-27*
