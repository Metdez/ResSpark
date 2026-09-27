<!-- refreshed: 2026-09-27 -->
# Architecture

**Analysis Date:** 2026-09-27

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────┐
│                      Browser presentation layer                       │
├──────────────────────┬──────────────────────┬─────────────────────────┤
│ Guided intake        │ Document upload      │ Resolution results      │
│ `src/frontend/src/`  │ `src/frontend/src/`  │ `src/frontend/src/`     │
│ `app.ts`             │ `document-upload/`   │ `resolution-results/`   │
└──────────┬───────────┴──────────┬───────────┴────────────▲────────────┘
           │ answers + files      │ multipart POST         │ JSON result
           └──────────────────────▼─────────────────────────┘
┌───────────────────────────────────────────────────────────────────────┐
│                 Local HTTP application boundary                      │
│                 `src/case_api.py` — `POST /api/cases`                │
└──────────┬──────────────────────┬─────────────────────────┬───────────┘
           │                      │                         │
           ▼                      ▼                         ▼
┌───────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐
│ Document pipeline │  │ Intake orchestration │  │ Response projection │
│ `src/`            │  │ `src/`               │  │ `src/case_api.py`   │
│ `document_parse.py`│ │ `intake_workflow.py` │  │                     │
└──────────┬────────┘  └──────────┬───────────┘  └─────────────────────┘
           │ extracted fields      │ canonical mapping
           └───────────────────────▼
                         ┌─────────────────────────────┐
                         │ Deterministic domain engine │
                         │ `src/financial_data.py`     │
                         │ `src/determination.py`      │
                         └──────────────┬──────────────┘
                                        │ repository protocol
                                        ▼
                         ┌─────────────────────────────┐
                         │ PostgreSQL IRS standards    │
                         │ `src/standards.py`          │
                         │ `src/standards_repository.py`│
                         │ `src/schemas/`              │
                         └─────────────────────────────┘
```

The running application is a client/server screening pipeline. The browser is a vanilla TypeScript single-page flow under `src/frontend/src/`; the backend is a standard-library `ThreadingHTTPServer` in `src/case_api.py`. Uploaded PDF contents are converted into a transient canonical row by `src/document_parse.py`, validated and gated by `src/intake_workflow.py`, and calculated by the deterministic rules in `src/determination.py`. PostgreSQL is queried for IRS standard amounts through `src/standards_repository.py`; the HTTP path does not currently persist cases into the case tables declared by `src/schemas/database_schema.sql`.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Browser application shell | Own the splash → intake → documents → results state machine and session draft | `src/frontend/src/app.ts` |
| Question model | Declare typed browser questions, conditional applicability, and state/county options | `src/frontend/src/questions.ts` |
| Intake primitives | Filter applicable questions, validate raw controls, and parse typed answers | `src/frontend/src/flow.ts` |
| Document request selector | Derive required upload categories and per-vehicle slots from answers | `src/frontend/src/document-upload/requests.ts` |
| Document upload view | Collect, label, and validate files before submission | `src/frontend/src/document-upload/screen.ts` |
| API client | Serialize answers, metadata, and files as multipart form data; validate response shape | `src/frontend/src/case-processing.ts` |
| Result projection | Define the browser-facing response contract and render escaped result data | `src/frontend/src/resolution-results/model.ts`, `src/frontend/src/resolution-results/screen.ts` |
| HTTP composition root | Parse requests, merge answers and extracted facts, acquire standards, and build response JSON | `src/case_api.py` |
| Document extraction pipeline | Extract ReportLab PDF text, classify document types, parse fields, and merge repeated documents | `src/document_parse.py` |
| Intake workflow | Enforce question applicability, missing-data gates, document requests, and calculation handoff | `src/intake_workflow.py` |
| Canonical domain record | Represent the calculation inputs shared by intake and determination | `src/financial_data.py` |
| Determination engine | Calculate income, allowable expenses, equity, compliance gates, and suggested path | `src/determination.py` |
| Standards facade | Keep determination calls independent of concrete storage method names | `src/standards.py` |
| Standards repository | Define the lookup protocol and parameterized PostgreSQL implementation | `src/standards_repository.py` |
| Relational model | Define canonical case data, evidence, immutable runs, and lookup tables | `src/schemas/database_schema.sql` |

## Pattern Overview

**Overall:** Layered client/server application with functional-core/domain calculations and adapter-based external access.

**Key Characteristics:**
- Keep UI state and DOM rendering in `src/frontend/src/`; the browser knows the API response contract but does not reproduce calculation logic from `src/determination.py`.
- Use a transient dictionary with `case_financial_data` field names as the integration representation in `src/case_api.py`, `src/document_parse.py`, and `src/intake_workflow.py`.
- Convert that dictionary into the typed `FinancialData` dataclass only after required fields are known in `src/intake_workflow.py`.
- Inject the structural `StandardsRepository` protocol from `src/standards_repository.py` into `src/determination.py`, allowing tests to use a fake without PostgreSQL.
- Keep document parsing heuristic/LLM-assisted in `src/document_parse.py`, but keep path selection deterministic in `src/determination.py`.
- Treat `NULL` as unknown and numeric zero as known zero in `src/schemas/database_schema.sql` and `src/intake_workflow.py`; do not collapse these meanings in new code.

## Layers

**Browser Bootstrap and Navigation:**
- Purpose: Mount the application and coordinate the four user-visible screens.
- Location: `src/frontend/src/main.ts`, `src/frontend/src/app.ts`
- Contains: DOM bootstrap, screen state, question navigation, session draft state, and transitions to uploads/results.
- Depends on: `src/frontend/src/flow.ts`, `src/frontend/src/questions.ts`, `src/frontend/src/document-upload/screen.ts`, `src/frontend/src/case-processing.ts`, and `src/frontend/src/resolution-results/screen.ts`.
- Used by: `src/frontend/index.html`.

**Browser Feature Modules:**
- Purpose: Encapsulate question rules, upload requirements, API serialization, and result rendering.
- Location: `src/frontend/src/flow.ts`, `src/frontend/src/questions.ts`, `src/frontend/src/case-processing.ts`, `src/frontend/src/document-upload/`, `src/frontend/src/resolution-results/`
- Contains: Pure selectors and validators alongside feature-specific DOM renderers and typed DTOs.
- Depends on: browser DOM APIs, `@material/web` selects imported by `src/frontend/src/app.ts`, and `fetch` in `src/frontend/src/case-processing.ts`.
- Used by: `src/frontend/src/app.ts`.

**HTTP/Application Layer:**
- Purpose: Translate multipart HTTP input into a screening workflow and translate the workflow back into JSON.
- Location: `src/case_api.py`
- Contains: request-size/path checks, multipart parsing, input validation, document staging, assumptions for screenability, database connection acquisition, and response projection.
- Depends on: `src/document_parse.py`, `src/intake_workflow.py`, `src/financial_data.py`, `src/questions.py`, and `src/standards_repository.py`.
- Used by: `src/frontend/src/case-processing.ts`; directly exercised by `src/tests/test_case_api.py`.

**Document Ingestion Layer:**
- Purpose: Convert uploaded PDFs into canonical financial fields without allowing one bad file to discard successful files.
- Location: `src/document_parse.py`
- Contains: PDF stream decoding, text classification, template parsers, optional Sciforium fallback, repeated-document aggregation, and per-file error collection.
- Depends on: Python standard library plus environment-provided Sciforium settings; it does not depend on determination code.
- Used by: `src/case_api.py`, `src/tests/test_document_parse.py`, and packet-level workflows through `parse_packet`.

**Workflow Layer:**
- Purpose: Decide what information is applicable/missing, what documents to request, and whether deterministic evaluation may run.
- Location: `src/intake_workflow.py`, `src/questions.py`
- Contains: question declarations, applicability, typed answer validation, document requests, missing-field detection, review flags, and `WorkflowResult`.
- Depends on: `src/financial_data.py`, `src/determination.py`, and the `StandardsRepository` contract in `src/standards_repository.py`.
- Used by: `src/case_api.py` and `src/tests/test_intake_workflow.py`.

**Domain Calculation Layer:**
- Purpose: Produce auditable, deterministic tax-resolution screening math and a suggested path.
- Location: `src/financial_data.py`, `src/determination.py`
- Contains: canonical dataclass, gross-income math, allowable-expense caps, realizable-equity math, compliance gating, and decision tree.
- Depends on: the thin lookup facade in `src/standards.py` and protocol in `src/standards_repository.py`.
- Used by: `src/intake_workflow.py`, `src/demo.py`, and unit tests in `src/tests/test_intake_workflow.py`.

**Infrastructure/Data Layer:**
- Purpose: Supply dynamic IRS standards and define the relational source-of-truth schema.
- Location: `src/standards.py`, `src/standards_repository.py`, `src/schemas/database_schema.sql`, `src/schemas/lookup_standards.seed.sql`
- Contains: repository protocol, parameterized DB-API queries, normalization functions, standards tables, case tables, document evidence tables, and immutable determination-run schema.
- Depends on: PostgreSQL 14+ and runtime `psycopg` loading in `src/case_api.py`/`src/demo.py`.
- Used by: `src/determination.py` for standards; case/evidence tables in `src/schemas/database_schema.sql` are defined but are not called by `src/case_api.py`.

## Data Flow

### Primary Request Path

1. `src/frontend/src/main.ts:10` mounts `createApp`; `src/frontend/src/app.ts:32` owns screen state and collects applicable answers defined in `src/frontend/src/questions.ts`.
2. `src/frontend/src/app.ts:222` delegates document collection to `src/frontend/src/document-upload/screen.ts:63`; the selector in `src/frontend/src/document-upload/requests.ts` derives the required categories.
3. `src/frontend/src/case-processing.ts:49` builds multipart fields `answers`, `document_metadata`, and repeated `documents`; `src/frontend/src/case-processing.ts:59` sends them to `POST /api/cases`.
4. `src/case_api.py:431` accepts only `/api/cases`, enforces the 32 MiB limit, and passes the body through `response_for` at `src/case_api.py:191`.
5. `src/case_api.py:44` validates taxpayer answers, stages uploaded bytes in a temporary directory, and calls `parse_uploads` at `src/document_parse.py:265`.
6. `src/document_parse.py` extracts PDF text, classifies each file from content, parses canonical fields, aggregates repeats, and returns both the merged fields and independent file errors.
7. `src/case_api.py:83` fills only explicit conditional zeros plus its enumerated screening assumptions, then `src/case_api.py:148` passes the row to `evaluate_case` at `src/intake_workflow.py:179`.
8. `src/intake_workflow.py` returns `information_needed` while applicable question or financial fields remain unknown. Otherwise it builds `FinancialData` and calls `determine_resolution_path` at `src/determination.py:148`.
9. `src/determination.py:38` requests standards through `src/standards.py`; `src/standards_repository.py:26` executes parameterized PostgreSQL lookups. `src/case_api.py:200` creates this adapter from `DATABASE_URL` only when a complete case needs calculation.
10. `src/case_api.py:220` projects outcome, uploaded-file metadata, needed documents, and canonical fields to JSON. `src/frontend/src/case-processing.ts` checks its shape, and `src/frontend/src/resolution-results/screen.ts:64` renders the result.

### Incomplete-Case Flow

1. `src/intake_workflow.py:101` and `src/intake_workflow.py:110` distinguish unanswered questions and unknown financial columns.
2. `src/intake_workflow.py:179` returns `WorkflowResult(status="information_needed")` without entering the calculation layer.
3. `src/case_api.py:148` converts missing keys into human labels and maps keys back to suggested document categories through `_file_code` in `src/case_api.py`.
4. `src/frontend/src/resolution-results/screen.ts` renders `neededDocuments` alongside the canonical record rather than claiming a resolution match.

### Document Fallback Flow

1. `src/document_parse.py:233` uses deterministic phrase matching to assign one of the supported upload codes.
2. `src/document_parse.py:279` runs a template parser; failures return a per-file error while successful siblings continue.
3. For recognized document types with readable text, `src/document_parse.py:330` may call the Sciforium completion endpoint to fill only the whitelisted canonical fields.
4. `src/document_parse.py:362` accepts fallback output only when all required fields for that document kind are present and type-coercible.
5. `src/document_parse.py:115` aggregates multiple statements and returns one row to `src/case_api.py`.

### Database-Backed Demo Flow

1. `src/demo.py` constructs three `FinancialData` scenarios directly.
2. `src/demo.py:86` opens a `psycopg` connection and wraps it in `PostgresStandardsRepository`.
3. `src/demo.py:16` invokes the same `src/determination.py` functions used by the HTTP workflow and prints their math.

**State Management:**
- Browser answers, current question index, and pre-result screen are held in closure state and mirrored to `sessionStorage` under `resspark.intake.v1` by `src/frontend/src/app.ts`; selected files and returned results are memory-only.
- Request processing uses local dictionaries and temporary files in `src/case_api.py`; no process-global mutable case collection exists.
- PostgreSQL case/evidence/run tables are modeled by `src/schemas/database_schema.sql`, but the current HTTP endpoint queries PostgreSQL only for standards and does not insert into those tables.

## Key Abstractions

**Canonical Case Row:**
- Purpose: Give answers and extraction output one shared namespace matching `case_financial_data` columns.
- Examples: `src/schemas/database_schema.sql`, `src/intake_workflow.py`, `src/document_parse.py`, `src/case_api.py`
- Pattern: Dictionary at integration boundaries; validated conversion to a dataclass at the domain boundary.

**`FinancialData`:**
- Purpose: Carry complete, typed calculation facts into deterministic screening.
- Examples: `src/financial_data.py`, constructed by `financial_data_from_case_row` in `src/intake_workflow.py`
- Pattern: Standard-library dataclass with field names mirroring IRS form concepts and database columns.

**`WorkflowResult`:**
- Purpose: Represent both incomplete and evaluable workflows without exceptions as normal control flow.
- Examples: `src/intake_workflow.py`, consumed by `src/case_api.py`
- Pattern: Dataclass result envelope containing status, missing fields, document requests, review flags, and optional determination.

**`Determination`:**
- Purpose: Return the chosen suggested path with all key computed quantities and review signals.
- Examples: `src/determination.py`, mapped to JSON by `_outcome` in `src/case_api.py`
- Pattern: Deterministic value object returned from a pure decision tree except for injected standards reads.

**`StandardsRepository`:**
- Purpose: Isolate dynamic IRS standards from business rules and database implementation.
- Examples: protocol and PostgreSQL adapter in `src/standards_repository.py`; fake implementation in `src/tests/test_intake_workflow.py`
- Pattern: Structural typing via `Protocol`, constructor injection for concrete connection, and function-parameter injection through the workflow.

**Frontend DTOs:**
- Purpose: Fix the contract between multipart submission, returned screening JSON, and views.
- Examples: `SelectedDocument`/`CaseSubmission` in `src/frontend/src/case-processing.ts`; `ResolutionCaseResult` in `src/frontend/src/resolution-results/model.ts`
- Pattern: TypeScript interfaces plus runtime structural validation at the network boundary.

## Entry Points

**Browser Application:**
- Location: `src/frontend/index.html`, `src/frontend/src/main.ts`
- Triggers: Vite development server or built static page loads the ES module.
- Responsibilities: Locate `#app`, load shared CSS, and call `createApp`.

**Case HTTP API:**
- Location: `src/case_api.py`
- Triggers: `python src/case_api.py`, then `POST /api/cases` from `src/frontend/src/case-processing.ts`.
- Responsibilities: Host `127.0.0.1:8000`, enforce request path/size, orchestrate parsing and screening, and emit JSON.

**Command-Line Demo:**
- Location: `src/demo.py`
- Triggers: `python src/demo.py` with `DATABASE_URL` and `psycopg` available.
- Responsibilities: Execute three fixed scenarios against database-backed standards and print calculation details.

**Schema Bootstrap:**
- Location: `src/schemas/database_schema.sql`, `src/schemas/lookup_standards.seed.sql`
- Triggers: Explicit `psql` commands documented in `README.md` and `AGENTS.md`.
- Responsibilities: Create the data model first, then populate dynamic standards and normalization mappings.

**Test Suites:**
- Location: `src/tests/`, `src/frontend/src/*.test.ts`, `src/frontend/src/document-upload/*.test.ts`, `src/frontend/src/resolution-results/*.test.ts`
- Triggers: `python -m unittest discover -s src/tests -v` and `npm test` from `src/frontend/`.
- Responsibilities: Verify backend workflow/parsing/API behavior and frontend flow/rendering/submission behavior without a live standards database in unit tests.

## Architectural Constraints

- **Threading:** `src/case_api.py` uses `ThreadingHTTPServer`; request-local dictionaries and temporary directories are safe to isolate, but any future module-level mutable case state would need synchronization.
- **Global state:** The backend constants and `_DATABASE` sentinel in `src/case_api.py` are immutable. `src/document_parse.py` may populate missing Sciforium variables into `os.environ`; browser draft state lives in `sessionStorage` through `src/frontend/src/app.ts`.
- **Circular imports:** No circular dependency chain is present. Preserve the direction `case_api → intake_workflow → determination → standards → standards_repository` across `src/*.py`.
- **Import execution:** Python modules use same-directory absolute imports such as `from financial_data import FinancialData` in `src/determination.py`; run scripts from repository root as documented rather than treating `src` as an installed package.
- **Canonical unknown semantics:** `NULL`/missing means unknown while `0` means known zero in `src/schemas/database_schema.sql` and `src/intake_workflow.py`. New transforms must preserve this distinction.
- **Determinism boundary:** LLM fallback is permitted only in extraction/error assistance in `src/document_parse.py`; calculations and path selection must remain deterministic in `src/determination.py`.
- **Standards boundary:** Dynamic IRS values belong in `src/schemas/lookup_standards.seed.sql` and must be accessed through `src/standards_repository.py`, not embedded in frontend or Python calculation code.
- **Frontend language:** All new browser logic must remain TypeScript under `src/frontend/src/`, consistent with `AGENTS.md` and strict `src/frontend/tsconfig.json`.
- **Persistence boundary:** The runtime endpoint in `src/case_api.py` is stateless and does not implement the case/document/run persistence designed in `src/schemas/database_schema.sql`; do not assume submitted cases can be retrieved later.

## Anti-Patterns

### Reproducing Tax Calculations Outside the Domain Engine

**What happens:** A UI, API serializer, parser, or repository starts choosing resolution paths or duplicating formulas from `src/determination.py`.
**Why it's wrong:** The audit boundary depends on one deterministic implementation; duplicated rules can diverge and make a professional-review result inconsistent.
**Do this instead:** Map facts to `FinancialData` through `src/intake_workflow.py` and call `determine_resolution_path` in `src/determination.py` with an injected `StandardsRepository`.

### Treating Missing Values as Ordinary Zero

**What happens:** An unknown financial field is defaulted to zero before `missing_financial_columns` in `src/intake_workflow.py` can block evaluation.
**Why it's wrong:** A smaller income, asset, or expense can materially change the path; `src/schemas/database_schema.sql` explicitly distinguishes `NULL` from `0`.
**Do this instead:** Leave unknowns absent/`None`, add only justified conditional facts in `_screenable` at `src/case_api.py:83`, and update focused tests in `src/tests/` for any new assumption.

### Trusting the Browser Upload Category

**What happens:** Backend parsing relies on `category` metadata chosen in `src/frontend/src/document-upload/screen.ts`.
**Why it's wrong:** Frontend filename sorting is advisory and untrusted; a file can be mislabeled or submitted outside the UI.
**Do this instead:** Continue classifying from extracted document content with `classify_upload` in `src/document_parse.py:233`; use browser metadata only for response display in `src/case_api.py`.

### Adding Standards or Location Tables to Python/TypeScript

**What happens:** Current IRS standard amounts or state/county mappings are hard-coded in `src/determination.py` or `src/frontend/src/`.
**Why it's wrong:** It bypasses the data update path and creates competing sources of truth.
**Do this instead:** Update `src/schemas/database_schema.sql`/`src/schemas/lookup_standards.seed.sql` and expose access through `src/standards_repository.py` and `src/standards.py`.

### Assuming the Declared Case Schema Is Runtime Persistence

**What happens:** New features read `cases`, `case_financial_data`, `documents`, or `determination_runs` expecting `src/case_api.py` to have populated them.
**Why it's wrong:** The current endpoint retains case data only for the request and uses PostgreSQL solely for standards lookup.
**Do this instead:** Treat the schema in `src/schemas/database_schema.sql` as an unconnected storage design until an explicit repository/application layer writes and reads it.

## Error Handling

**Strategy:** Validate at each boundary, preserve partial document success, block deterministic evaluation on required unknowns, and return professional-review-oriented outcomes instead of raw backend failures where possible.

**Patterns:**
- `src/frontend/src/flow.ts` returns user-facing validation strings instead of throwing for expected answer errors.
- `src/frontend/src/case-processing.ts` throws for HTTP failure or malformed response; `src/frontend/src/document-upload/screen.ts` catches submission failures and restores the submit button.
- `src/case_api.py:191` maps malformed multipart/input `ValueError` to HTTP 400 JSON, while its handler uses HTTP 404 and 413 for route/size failures.
- `src/document_parse.py:265` records `{file, error}` for each failed upload and continues merging successful files.
- `src/intake_workflow.py:179` represents missing information as `WorkflowResult(status="information_needed")`, not an exception.
- `src/case_api.py:148` converts missing standards configuration, missing `psycopg`, lookup misses, and database failures into a manual-review payload.
- `src/standards_repository.py` raises `StandardsLookupError` when parameterized queries return no applicable row.

## Cross-Cutting Concerns

**Logging:** The only operational log is the startup message in `src/case_api.py`; no structured request, extraction, database, or error logging layer is present.

**Validation:** Browser controls are validated in `src/frontend/src/flow.ts`, API answer types in `src/case_api.py` through declarations in `src/questions.py`, LLM fields in `src/document_parse.py`, canonical completeness in `src/intake_workflow.py`, and database invariants in `src/schemas/database_schema.sql`.

**Authentication:** No authentication or authorization layer is present in `src/case_api.py` or `src/frontend/src/`; the server binds only to `127.0.0.1` in its current entry point.

**Privacy:** Uploaded bytes are written only into a `TemporaryDirectory` by `src/case_api.py`, but readable document text can be sent to Sciforium by `src/document_parse.py` when deterministic parsing fails. Synthetic packets live under `examples/`; production taxpayer data must not be committed per `AGENTS.md`.

**Security:** `src/frontend/src/resolution-results/screen.ts` escapes result values before HTML interpolation, and `src/standards_repository.py` uses DB-API parameter binding. Multipart parsing in `src/case_api.py` is custom and bounded by `_MAX_BODY`.

---

*Architecture analysis: 2026-09-27*
