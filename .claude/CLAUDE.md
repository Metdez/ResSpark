<!-- GSD:project-start source:PROJECT.md -->

## Project

**ResSpark — Tax Resolution Intake & Document Collection Platform**

ResSpark is a two-sided web platform for tax-resolution firms (first customer: ValorTax, who use IRS Logics as their case CRM). Staff log in to an admin portal, look up an existing Logics case by case ID, phone, or email, confirm the client, and send the client a link. The client opens that link on their phone with no account or password, and in a guided flow connects their bank (Plaid, with Teller as a drop-in alternative), connects their payroll provider (Truv), confirms their address, uploads any remaining documents, and e-signs forms. Everything the client provides lands in the admin case view with live status, and staff push the documents straight into the Logics case with one click. The existing ResSpark screening engine (32-question intake, Form 433-A math, IRS standards, resolution-path determination) becomes the "433-A pre-population" view that staff can review.

**Core Value:** A case manager can send a client one link and get bank statements, pay stubs, and documents back into the Logics case without chasing, babysitting, or re-uploading. If nothing else works, "send link, client connects, docs appear in the case" must work.

### Constraints

- **Timeline**: Working MVP demo on Mon Oct 12 2026 11:30 — admin portal, client portal, Supabase, Truv, Plaid (Teller-ready), e-sign, Logics push. Everything else is iteration after feedback every 2-3 days.
- **Tech stack**: TypeScript for all front end (CLAUDE.md). Supabase for data, auth, and storage; Cloudflare for hosting and the API Worker; OpenRouter for any LLM calls. The Python engine may remain for the 433-A math or be ported; decide in that phase with targeted tests either way.
- **Compliance and domain**: Form 433-A is signed under penalty of perjury; calculations and eligibility gates must stay deterministic and sourced (CLAUDE.md). Never change IRS thresholds or formulas without an authoritative source and tests. ResSpark screens; a CPA or EA reviews.
- **Security**: Client tax documents and bank data are sensitive. Secrets server-side only; RLS on every table; signed, short-lived download URLs; audit log; the client link must be unguessable and expirable; do not send raw documents to an LLM without a deliberate decision.
- **Code rules (CLAUDE.md)**: no code file over 500 lines, split modularly; a companion Markdown doc in `docs/` for every code file, kept in sync; Ponytail (smallest complete change); unittest and Vitest style; standard library preferred in Python.
- **Bank-statement window**: 6 months by default (standard resolution uses the last 3; pull 6 so the firm can choose).
- **Logics upload limit**: 6 MB per file; compress or split PDFs.
- **Budget**: pay-as-you-go integrations only; no annual contracts.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- Python 3 - Backend: screening logic, document parsing, local HTTP API, DB access. Files: `src/determination.py`, `src/intake_workflow.py`, `src/document_parse.py`, `src/case_api.py`, `src/standards_repository.py`, `src/demo.py`
- TypeScript (ES2022 target, `strict: true`) - Frontend intake and results UI. Files: `src/frontend/src/*.ts`, `src/frontend/src/**/*.ts`, config in `src/frontend/tsconfig.json`
- SQL (PostgreSQL dialect) - Schema and IRS standards seed data. Files: `src/schemas/database_schema.sql`, `src/schemas/lookup_standards.seed.sql`
- JavaScript (ESM) - Vite config and a generator script. Files: `src/frontend/vite.config.js`, `src/frontend/scripts/generate-counties.mjs`
- CSS - Frontend styling. Files: `src/frontend/src/styles.css`, `src/frontend/src/resolution-results/styles.css`
- HTML - Frontend entry. File: `src/frontend/index.html`

## Runtime

- Python 3 (no version pinned; code uses `from __future__ import annotations` and built-in generics such as `list[...]`, so 3.9+ is the practical floor). No `.python-version` detected.
- Node.js `>=18` (declared in `src/frontend/package.json` under `engines`). No `.nvmrc` detected.
- Local dev server for the API: `http.server.ThreadingHTTPServer` on `127.0.0.1:8000` (`src/case_api.py`).
- Python: no manifest (`requirements.txt`, `pyproject.toml`, `Pipfile`, `setup.py` all absent). Only third-party import is `psycopg` (lazy-imported in `src/case_api.py` and `src/demo.py`). Lockfile: missing.
- npm: `src/frontend/package.json`

## Frameworks

- No Python web framework. The API is stdlib `http.server` (`BaseHTTPRequestHandler`, `ThreadingHTTPServer`) in `src/case_api.py`, serving `POST /api/cases`.
- Frontend is vanilla TypeScript with no UI framework (no React/Vue/Svelte in `package.json`). Components are `@material/web` web components plus hand-written DOM modules (`src/frontend/src/app.ts`, `src/frontend/src/flow.ts`, `src/frontend/src/document-upload/screen.ts`, `src/frontend/src/resolution-results/screen.ts`).
- Python: `unittest` (stdlib). Run with `python -m unittest discover -s src/tests -v`. Tests in `src/tests/` (e.g. `src/tests/test_document_parse.py`) use `unittest.mock.patch`.
- Frontend: Vitest `^5.0.2` (lock resolves to 5.0.2) with jsdom `^26.0.0`. Config: `src/frontend/vitest.config.ts` (setup file `src/frontend/src/test-setup.ts`). Test files: `src/frontend/src/*.test.ts`.
- Vite `^6.1.0` (lock resolves to 6.4.3) - dev server and bundler. Config: `src/frontend/vite.config.js`. Dev server proxies `/api` to `http://127.0.0.1:8000`.
- TypeScript `^5.7.3` (lock resolves to 5.9.3) - type checking via `tsc --noEmit` in the `build` script.

## Key Dependencies

- `@supabase/supabase-js` `^2.117.3` (lock resolves to 2.117.3) - Supabase client. Created in `src/frontend/src/supabase/client.ts`.
- `@material/web` `^2.5.0` (lock resolves to 2.5.0) - Material Design web components used for the UI.
- `psycopg` (v3 API, `import psycopg`) - PostgreSQL driver, not declared in any manifest. Used in `src/case_api.py` and `src/demo.py` to connect via `DATABASE_URL`.
- Python standard library carries the rest: `urllib.request` (OpenRouter and HTTP calls), `zlib` and `base64` (PDF stream decoding in `src/document_parse.py`), `decimal` (money math), `dataclasses`, `http.server`, `pathlib` and `tempfile` for file handling.
- `jsdom` `^26.0.0` - DOM environment for Vitest.
- `vite` `^6.1.0` and `typescript` `^5.7.3` - listed under devDependencies.

## Configuration

- Configuration is read from environment variables. A root `.env` file exists (git-ignored via `.gitignore` entry `.env`). Its contents were not read. Variable names documented in templates:
- `src/document_parse.py` loads `.env` itself: it reads the file and calls `os.environ.setdefault` for each entry (around line 434), so existing shell variables take precedence.
- `src/frontend/src/supabase/client.ts` throws at startup if `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is missing. Vite exposes only `VITE_`-prefixed variables to the browser.
- `.gitignore` covers `venv/`, `__pycache__/`, `node_modules/`, `.env`.
- `src/frontend/tsconfig.json` - target ES2022, module ESNext, strict.
- `src/frontend/vite.config.js` - dev proxy.
- `src/frontend/vitest.config.ts` - test setup.
- `src/frontend/scripts/generate-counties.mjs` (npm script `generate:counties`) regenerates `src/frontend/src/counties.generated.ts`.
- Database: `src/schemas/database_schema.sql` and `src/schemas/lookup_standards.seed.sql`, applied with `psql`.
- No `wrangler.toml`, `wrangler.jsonc`, or Worker/Pages source files are in the repo.
- The project `CLAUDE.md` states that a `CLOUDFLARE_API_TOKEN` is kept in `.env` and that `npx wrangler` or the Cloudflare API is available. The token value was not read.

## Platform Requirements

- Python 3 with `psycopg` installed.
- Node.js 18+ and npm, with `src/frontend/node_modules` installed.
- PostgreSQL reachable through `DATABASE_URL` for database-backed runs. The standards tests use a fake repository and need no database.
- `psql` on PATH to apply the schema and seed files.
- Windows-compatible shell (repo docs use PowerShell syntax such as `$env:DATABASE_URL`).
- Not defined in the repo. No Dockerfile, docker-compose, CI config, or deploy script was found. The Python server is a local dev server (`print("ResSpark case API at http://127.0.0.1:8000/api/cases")`).
- The frontend builds to `src/frontend/dist/` (`npm run build`). A `dist/` directory already exists.

## Other Directories (not analyzed for stack)

- `.sandboxes/` - Sandbox copies of the project, including duplicate `src/frontend/package.json` files. Not part of the main stack.
- `Discovery/` - Not analyzed.
- `examples/` (lowercase in repo root) - Synthetic client-document packets. The `Context/` directory named in the brief was not found at the repo root.
- `forms/`, `planning/` - Not analyzed for stack.
- `.agents/`, `.claude/` - Agent and skill configuration.
- `src/frontend/node_modules/` - Vendored dependencies; excluded.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Python modules: lowercase snake_case, one concern per module: `src/intake_workflow.py`, `src/standards_repository.py`, `src/case_api.py`, `src/document_parse.py`.
- Python tests: `src/tests/test_<module>.py` (for example `src/tests/test_case_api.py`).
- TypeScript modules: kebab-case: `src/frontend/src/case-processing.ts`, `src/frontend/src/resolution-results/model.ts`, `src/frontend/src/document-upload/requests.ts`.
- TypeScript tests are co-located beside the module they cover: `src/frontend/src/case-processing.test.ts`, `src/frontend/src/document-upload/screen.test.ts`.
- Generated data is marked by name: `src/frontend/src/counties.generated.ts` (produced by `src/frontend/scripts/generate-counties.mjs`; do not hand-edit).
- SQL: `src/schemas/database_schema.sql`, `src/schemas/lookup_standards.seed.sql`.
- snake_case throughout: `calculate_gross_monthly_income()` in `src/determination.py`, `parse_uploads()` in `src/document_parse.py`.
- Private helpers are prefixed with a single underscore: `_is_applicable()` and `_REQUESTS` in `src/intake_workflow.py`, `_sum_amounts()` and `_llm_json()` in `src/document_parse.py`.
- Module-level constants are UPPER_SNAKE_CASE: `QUESTION_BY_ID`, `REQUIRED_FINANCIAL_COLUMNS`, `INITIAL_QUESTION_IDS` in `src/intake_workflow.py`, `_MAX_BODY` in `src/case_api.py`.
- Field names mirror the database columns in `case_financial_data` (snake_case): `actual_housing_utilities`, `gross_wages_taxpayer`, `vehicle_count`. Keep Python field names and SQL column names identical.
- Classes are PascalCase: `FinancialData`, `DocumentRequest`, `WorkflowResult`, `PostgresStandardsRepository`, `StandardsLookupError`.
- Protocols are used for the injected dependency contract: `StandardsRepository` in `src/standards_repository.py`.
- Functions and variables: camelCase (`processCase`, `renderDocumentUpload`, `isCaseResult`).
- Types and interfaces: PascalCase (`SelectedDocument`, `CaseSubmission`, `CaseProcessor`, `ResolutionCaseResult`).
- Type guards are arrow functions named `isX` returning `value is T`: `isObject` and `isCaseResult` in `src/frontend/src/case-processing.ts`.
- API payloads use camelCase keys (`categoryLabel`, `reviewNotes`, `financialSections`) while Python emits the same keys. Form field names keep snake_case (`answers`, `document_metadata`).
- DOM hooks use data attributes, not classes: `data-document-code`, `data-document-request`, `data-request-status`, `data-slot-file`. Keep this pattern for test selectors.

## Code Style

- No Prettier or Biome config is present in the repository. Formatting is manual.
- Observed style: 4-space indent in Python, 2-space indent in TypeScript (`src/frontend/src/case-processing.ts`), double quotes in TypeScript, trailing semicolons in TypeScript.
- Python lines are long in places (up to about 120 characters in `src/determination.py` and `src/intake_workflow.py`). Match the surrounding file rather than reflowing.
- No ESLint or Ruff/Flake8 config is present.
- TypeScript strict mode is the enforced check: `src/frontend/tsconfig.json` sets `"strict": true`, `"noEmit": true`, `"isolatedModules": true`. The build script runs `tsc --noEmit` before `vite build` (`src/frontend/package.json`).
- Python uses full type hints on function signatures (about 122 `->` annotations across `src/*.py`). Use `X | None` and `list[dict]`, `tuple[...]`, not `Optional`/`List`/`Tuple`.
- `from __future__ import annotations` is used in `src/intake_workflow.py`, `src/case_api.py`, `src/standards_repository.py`, and `src/tests/test_case_api.py`. Add it to new modules that use forward references.

## Data Modelling

- Use `@dataclass` for value objects. Use `frozen=True` for immutable records: `DocumentRequest` in `src/intake_workflow.py`. Use `field(default_factory=list)` for mutable defaults: `WorkflowResult` in `src/intake_workflow.py`.
- `FinancialData` in `src/financial_data.py` is the canonical fact container. Its dataclass fields define the required columns (`REQUIRED_FINANCIAL_COLUMNS` is derived from `FinancialData.__dataclass_fields__`).
- Distinguish unknown from zero. Use `None` for unknown and `0` for known-zero. Required unknowns must block evaluation (see `missing_financial_columns()` in `src/intake_workflow.py`). Never default a required value silently.
- Use `interface` for object shapes (`CaseSubmission`, `SelectedDocument` in `src/frontend/src/case-processing.ts`) and `type` for unions and function types (`CaseProcessor`).
- Validate every API response at the boundary with a type guard before use (`isCaseResult` in `src/frontend/src/case-processing.ts`). Do not cast untrusted JSON to a type.

## Import Organization

- `import type` for type-only imports (`import type { Answers } from "./questions";` in `src/frontend/src/case-processing.ts`).
- Relative imports only. No path aliases are configured in `src/frontend/tsconfig.json`.
- No barrel `index.ts` files exist; import from the module file directly.

## Error Handling

- Domain errors subclass the built-in: `StandardsLookupError(LookupError)` in `src/standards_repository.py`. Raise `ValueError` for bad input (`"answers must be a JSON object."` in `src/case_api.py`).
- Convert low-level errors with `from error` chaining: `raise LookupError("Install psycopg to look up IRS standards.") from error` in `src/case_api.py` and `src/demo.py`.
- Import of optional dependencies (`psycopg`) is wrapped in `try/except ImportError` and re-raised as a clear runtime message.
- The HTTP handler in `src/case_api.py` maps `ValueError` to 400 and `LookupError` to a 503-style response. Keep this split: input problems are `ValueError`, missing standards are `LookupError`.
- Catch-all `except Exception` is used only at the outer HTTP boundary in `src/case_api.py`. Do not add new broad catches in calculation code.
- Known lossy shortcuts are annotated with the `ponytail:` marker in comments, for example `# ponytail: whole body is read into memory` in `src/case_api.py` and the module docstring of `src/document_parse.py`.
- Network failures become thrown `Error`s with the HTTP status in the message: `Case submission failed (503).` in `src/frontend/src/case-processing.ts`.
- Malformed responses throw `Error("... invalid result")`, not silent fallbacks.
- Test assertions use `rejects.toThrow(...)` to verify these messages.

## Logging

- Startup message in `src/case_api.py` and scenario output in `src/demo.py` use `print`. Do not add `print` to calculation modules (`src/determination.py`, `src/intake_workflow.py`).
- Errors are surfaced to the caller through exceptions and returned `review_flags` / `review_notes` lists, not logged.

## Comments and Docstrings

- Module docstrings explain purpose and the boundary the module owns (see `src/determination.py`, `src/standards_repository.py`).
- Cite the authority for any IRS rule in a comment. `src/determination.py` cites Form 433-A(OIC) line items and the $1,000 bank reserve and $3,450 vehicle exemption. Any new rule must carry the same kind of citation (see `AGENTS.md`).
- Section banners separate pipeline steps in `src/determination.py`: `# ---...` followed by `# STEP 1 — ...`.
- Use `ponytail:` prefixed comments to flag a known shortcut and its upgrade trigger.
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
- Test files over 500 lines also count. `src/tests/test_document_parse.py` is 558 lines and should be split by document kind.

## Companion Documentation (from CLAUDE.md and AGENTS.md)

- Each new code file needs a companion Markdown file in `docs/`, mirroring the source path.
- Current state: only `docs/src/frontend/src/supabase/client.md` exists. Companion docs are missing for `src/*.py`, the other frontend modules, and the tests. Add them when touching those files.
- Explanations belong in the Markdown file, not in long code comments.

## Project-Specific Rules

- Use TypeScript for all frontend code (`AGENTS.md`). Do not add `.js` source files under `src/frontend/src/`. The only JavaScript is the build helper `src/frontend/scripts/generate-counties.mjs`.
- Standard-library Python first. No new runtime Python dependencies unless the task requires one. `psycopg` is the only database driver and is imported lazily.
- Never print or commit `.env` values. Read configuration through `os.environ` (see `_load_env()` in `src/document_parse.py`).

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| SPA bootstrap | Mounts app into `#app`, imports global styles | `src/frontend/src/main.ts` |
| Intake controller | Renders taxpayer questions, validates and parses answers, drives screens | `src/frontend/src/app.ts` |
| Question flow helpers | Applicability filter, per-type validation, parsing, currency formatting | `src/frontend/src/flow.ts` |
| Question declarations (UI) | Browser copy of the intake questions | `src/frontend/src/questions.ts` |
| Upload screen | Document slots per category, file selection | `src/frontend/src/document-upload/screen.ts`, `requests.ts` |
| Case submission client | Builds FormData, POSTs `/api/cases`, validates response shape | `src/frontend/src/case-processing.ts` |
| Results screen | Renders outcome, requirements, financial sections | `src/frontend/src/resolution-results/screen.ts`, `model.ts` |
| Supabase client (unused) | Browser client stub; nothing imports it yet | `src/frontend/src/supabase/client.ts` |
| HTTP adapter | Parses multipart, returns 200/400 JSON, runs server on 127.0.0.1:8000 | `src/case_api.py` |
| Document ingestion | Classifies PDFs, extracts amounts/fields into case columns, merges documents | `src/document_parse.py` |
| Intake workflow | Question ordering, document requests, missing-data detection, row to FinancialData | `src/intake_workflow.py` |
| Canonical data model | `FinancialData` dataclass mirroring Form 433-A line items | `src/financial_data.py` |
| Question declarations (server) | 32 intake question definitions with Python types | `src/questions.py` |
| Calculator | Deterministic IRS screening math and path selection | `src/determination.py` |
| Standards facade | Thin functions delegating to a repository | `src/standards.py` |
| Standards repository | Protocol plus parameterized PostgreSQL implementation | `src/standards_repository.py` |
| Demo | Runs worked scenarios against the calculator | `src/demo.py` |

## Pattern Overview

- The calculation core is pure Python with no LLM involvement. LLM use is confined to extraction in `src/document_parse.py` (`_llm_json`).
- Standards data is never hard-coded in Python business logic. It is fetched through the `StandardsRepository` Protocol in `src/standards_repository.py`.
- Dependency injection at the data boundary: `case_result` and `result_for_row` in `src/case_api.py` accept a `standards_repository` argument. The sentinel `_DATABASE` selects the live PostgreSQL path by default. Tests pass a fake repository.
- Unknown values stay `None` (not `0`) until answered. Missing required facts block evaluation rather than defaulting.
- Frontend and backend communicate only through the JSON contract validated by `isCaseResult` in `src/frontend/src/case-processing.ts`.
- No database write path is wired in the code reviewed. The `cases`, `documents`, `document_extractions`, and `determination_runs` tables in `src/schemas/database_schema.sql` have no writer.

## Layers

- Purpose: Question flow, uploads, results rendering.
- Location: `src/frontend/src/`
- Contains: TypeScript modules, Material Web components (`@material/web`), CSS.
- Depends on: `case-processing.ts` for the server call; `questions.ts` for declarations.
- Used by: `src/frontend/index.html` via `src/frontend/src/main.ts`.
- Purpose: Convert HTTP multipart into Python calls and JSON back.
- Location: `src/case_api.py`
- Contains: `_Handler(BaseHTTPRequestHandler)`, `_read_form`, `_answers`, `_sections`, `_format`, `response_for`.
- Depends on: `document_parse`, `intake_workflow`, `questions`, `standards_repository`.
- Used by: the Vite dev proxy and `python src/case_api.py`.
- Purpose: Convert uploaded PDFs into canonical case columns.
- Location: `src/document_parse.py`
- Contains: `parse_uploads` (entry), `classify_upload`, per-kind parsers (`_account_transcript`, `_pay_stub`, `_bank_statement`, `_lease`, `_mortgage`, `_auto`, and others), `merge_documents`, `_llm_json` (OpenRouter over `urllib`).
- Depends on: PDF text helper `_page_text`; environment variables `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`.
- Used by: `case_api._parsed`, and `parse_packet` for batch use.
- Purpose: Decide what the taxpayer must still answer and which documents to request, then build `FinancialData`.
- Location: `src/intake_workflow.py`
- Contains: `INITIAL_QUESTION_IDS`, `_REQUESTS` (`DocumentRequest` table), `missing_question_ids`, `missing_financial_columns`, `financial_data_from_case_row`, `evaluate_case`.
- Depends on: `determination`, `financial_data`, `questions`, `standards_repository` (type only).
- Used by: `case_api`, tests.
- Purpose: Form 433-A(OIC) arithmetic and resolution-path selection.
- Location: `src/determination.py`, `src/financial_data.py`
- Contains: `calculate_gross_monthly_income`, `calculate_allowable_expenses`, `calculate_net_disposable_income`, `calculate_net_realizable_equity`, `passes_compliance_gate`, `determine_resolution_path`, and the `Determination` dataclass.
- Depends on: `standards` (facade only). It does not import `psycopg` or any database module.
- Used by: `intake_workflow.evaluate_case`, `demo.py`.
- Purpose: Retrieve IRS standard amounts and location mappings.
- Location: `src/standards.py` (facade), `src/standards_repository.py` (Protocol and Postgres implementation), `src/schemas/`.
- Depends on: a caller-supplied DB-API connection (`psycopg`), imported lazily inside `case_api._from_database`.
- Used by: `determination.py`.

## Data Flow

### Primary Request Path (screening a case)

### Standards Lookup

### Demo Flow

- Browser: module-level state inside `createApp` in `src/frontend/src/app.ts`; no store library.
- Server: stateless per request. No sessions, no cache.
- Persistence: none in the request path; the schema is defined but unused by the code reviewed.

## Key Abstractions

- Purpose: Canonical per-case facts, one field per Form 433-A line.
- Examples: `src/financial_data.py`
- Pattern: `@dataclass` with defaults. `REQUIRED_FINANCIAL_COLUMNS` in `src/intake_workflow.py` derives required fields from it.
- Purpose: Swappable source of IRS standards.
- Examples: `src/standards_repository.py` (Protocol and `PostgresStandardsRepository`); test fakes in `src/tests/test_intake_workflow.py` (`STANDARDS`).
- Pattern: `typing.Protocol` with structural typing; no inheritance required.
- Purpose: Output of the calculator (path, reason, NDI, equity, suggested offer or payment, review notes).
- Examples: `src/determination.py`
- Pattern: dataclass returned by `determine_resolution_path`.
- Purpose: Declarative intake questions with type and applicability.
- Examples: `src/questions.py` (server), `src/frontend/src/questions.ts` (browser).
- Pattern: plain dict list on the server; typed objects with `isApplicable` and `valueType` in the browser.
- Purpose: Describes one document the taxpayer must upload and why.
- Examples: `src/intake_workflow.py` (`_REQUESTS`), mirrored in `src/frontend/src/document-upload/requests.ts`.
- Pattern: frozen dataclass table keyed by code.

## Entry Points

- Location: `src/case_api.py` (`main`, binds `127.0.0.1:8000`)
- Triggers: `python src/case_api.py` run by the developer; receives `POST /api/cases`.
- Responsibilities: multipart parsing, orchestration, JSON response.
- Location: `src/frontend/src/main.ts` (loaded by `src/frontend/index.html`)
- Triggers: Vite dev server (`npm run dev`) or the static `src/frontend/dist/`.
- Responsibilities: mounts `createApp` on `#app`.
- Location: `src/demo.py`
- Triggers: `python src/demo.py` (needs `DATABASE_URL`).
- Responsibilities: prints worked scenarios.
- Location: `src/document_parse.py` (`parse_packet`, `parse_pdf`)
- Triggers: called from Python; the `examples/` packets are the intended inputs.

## Architectural Constraints

- **Threading:** `ThreadingHTTPServer` in `src/case_api.py` runs one thread per request. Each database-backed request opens its own `psycopg` connection; there is no pool.
- **Global state:** Module-level constants in `src/case_api.py` (`_MAX_BODY`, `_PATHS`, `_COUNTS`, `_NEXT`), `QUESTION_BY_ID` and `_REQUESTS` in `src/intake_workflow.py`, and the `_DATABASE` sentinel in `src/case_api.py`. All are read-only at runtime.
- **Environment loading:** `document_parse._load_env` reads a `.env` file and sets missing variables with `os.environ.setdefault`. Only `OPENROUTER_*` keys are consulted there.
- **Circular imports:** None observed. Dependency direction is `case_api` → `intake_workflow` → `determination` → `standards` → `standards_repository`.
- **Duplicated contract:** Question IDs and document-request codes exist in both Python and TypeScript (`src/questions.py` and `src/frontend/src/questions.ts`; `_REQUESTS` in `src/intake_workflow.py` and `src/frontend/src/document-upload/requests.ts`). Changes must be made in both places.
- **Unused module:** `src/frontend/src/supabase/client.ts` is not imported anywhere. It throws at import time if its env vars are missing, so it must not be imported casually.
- **Reference-only folders:** `forms/` (reference PDFs) and `planning/` are not read by code.

## Anti-Patterns

### Hard-coded standards in Python

### Defaulting unknown facts to zero

### A second case-data path

## Error Handling

- Bad multipart or validation failures raise `ValueError`, and `response_for` returns `400 {"error": ...}`.
- Missing standards raise `LookupError` / `StandardsLookupError`. `result_for_row` converts them into an "unresolved" outcome (`_unresolved`) with status `manual_review`.
- Document parse problems are collected as `errors` and surfaced as review notes through `_file_notes`.
- Frontend: `processCase` rejects on a non-OK response or an invalid shape, and `app.ts` shows the error message.

## Cross-Cutting Concerns

- Server: `validate_answer` in `src/intake_workflow.py` checks Python types against `QUESTIONS`; `_COUNTS` in `src/case_api.py` lists count fields.
- Browser: `validateAnswer` in `src/frontend/src/flow.ts`; `isCaseResult` in `src/frontend/src/case-processing.ts`.

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| supabase | "Use when doing ANY task involving Supabase. Triggers: Supabase products (Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues); client libraries and SSR integrations (supabase-js, @supabase/ssr) in Next.js, React, SvelteKit, Astro, Remix; auth issues (login, logout, sessions, JWT, cookies, getSession, getUser, getClaims, RLS); Supabase CLI or MCP server; schema changes, migrations, declarative schemas, security audits, Postgres extensions (pg_graphql, pg_cron, pg_vector); debugging and troubleshooting errors or unexpected behavior on Supabase projects (HTTP errors, Postgres errors, RLS surprises, permission denied, schema cache issues, timeouts, Edge Function crashes, Realtime drops, Storage failures) and reading or querying logs (Logs Explorer, ClickHouse)." | `.agents/skills/supabase/SKILL.md` |
| supabase-postgres-best-practices | "Postgres best practices maintained by Supabase, for Postgres running anywhere. Load this skill BEFORE writing or changing anything that lives in a Postgres database: creating or altering tables and columns (including choosing column types), schema design, migrations and declarative schema files, RLS policies and the tests that verify them, indexes, triggers, database functions, queues and scheduled jobs (pg_cron, pgmq), vector/semantic search (pgvector), and restoring dumps (pg_restore) or importing data. Also load it when diagnosing slow queries, high CPU, timeouts, EXPLAIN plans, connection exhaustion, locking, bloat, or rows visible to the wrong user or tenant. This is not just a performance guide — schema, migration, security, and SQL authoring tasks need these rules too, even for a one-column change or a single query." | `.agents/skills/supabase-postgres-best-practices/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
