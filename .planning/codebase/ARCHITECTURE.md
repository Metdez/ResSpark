---
last_mapped_commit: ba83e4e43838595a38647e26882014745b62d476
last_mapped_at: 2026-10-10
---
<!-- refreshed: 2026-10-10 -->

# Architecture

**Analysis Date:** 2026-10-10

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Browser SPA (Vite + TypeScript)  `src/frontend/src/`                 │
│  app.ts → flow.ts → document-upload/ → resolution-results/           │
│  case-processing.ts (POST /api/cases)                                 │
└───────────────┬──────────────────────────────────────────────────────┘
                │ multipart/form-data (answers + files)
                │ Vite dev proxy: /api → http://127.0.0.1:8000
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  HTTP adapter  `src/case_api.py`                                      │
│  ThreadingHTTPServer · _read_form · response_for · result_for_row     │
└───────┬─────────────────────────────┬────────────────────────────────┘
        │ uploads                     │ merged case row
        ▼                             ▼
┌─────────────────────────┐   ┌──────────────────────────────────────┐
│ Document ingestion      │   │ Intake workflow `intake_workflow.py`  │
│ `document_parse.py`     │──▶│ missing-data checks, applicability,   │
│ PDF text parse, classify│   │ document requests, FinancialData build│
│ optional LLM fill       │   └───────────────┬──────────────────────┘
│ (OpenRouter)            │                   │
└─────────────────────────┘                   ▼
                              ┌──────────────────────────────────────┐
                              │ Determination `determination.py`      │
                              │ income → expenses → NDI → equity →    │
                              │ compliance gate → path selection      │
                              └───────┬───────────────────────────────┘
                                      │ standards lookups (Protocol)
                                      ▼
                              ┌──────────────────────────────────────┐
                              │ `standards.py` facade                 │
                              │ `standards_repository.py`             │
                              │ PostgresStandardsRepository (psycopg) │
                              └───────────────┬──────────────────────┘
                                              ▼
                              PostgreSQL (`DATABASE_URL`)
                              `src/schemas/database_schema.sql`,
                              `src/schemas/lookup_standards.seed.sql`
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

**Overall:** Layered pipeline with a thin HTTP adapter, a deterministic calculation core, and an injected data-access boundary. The frontend is a single-page, screen-per-module TypeScript app that talks to one backend endpoint.

**Key Characteristics:**
- The calculation core is pure Python with no LLM involvement. LLM use is confined to extraction in `src/document_parse.py` (`_llm_json`).
- Standards data is never hard-coded in Python business logic. It is fetched through the `StandardsRepository` Protocol in `src/standards_repository.py`.
- Dependency injection at the data boundary: `case_result` and `result_for_row` in `src/case_api.py` accept a `standards_repository` argument. The sentinel `_DATABASE` selects the live PostgreSQL path by default. Tests pass a fake repository.
- Unknown values stay `None` (not `0`) until answered. Missing required facts block evaluation rather than defaulting.
- Frontend and backend communicate only through the JSON contract validated by `isCaseResult` in `src/frontend/src/case-processing.ts`.
- No database write path is wired in the code reviewed. The `cases`, `documents`, `document_extractions`, and `determination_runs` tables in `src/schemas/database_schema.sql` have no writer.

## Layers

**Presentation (browser):**
- Purpose: Question flow, uploads, results rendering.
- Location: `src/frontend/src/`
- Contains: TypeScript modules, Material Web components (`@material/web`), CSS.
- Depends on: `case-processing.ts` for the server call; `questions.ts` for declarations.
- Used by: `src/frontend/index.html` via `src/frontend/src/main.ts`.

**Transport adapter (server):**
- Purpose: Convert HTTP multipart into Python calls and JSON back.
- Location: `src/case_api.py`
- Contains: `_Handler(BaseHTTPRequestHandler)`, `_read_form`, `_answers`, `_sections`, `_format`, `response_for`.
- Depends on: `document_parse`, `intake_workflow`, `questions`, `standards_repository`.
- Used by: the Vite dev proxy and `python src/case_api.py`.

**Ingestion:**
- Purpose: Convert uploaded PDFs into canonical case columns.
- Location: `src/document_parse.py`
- Contains: `parse_uploads` (entry), `classify_upload`, per-kind parsers (`_account_transcript`, `_pay_stub`, `_bank_statement`, `_lease`, `_mortgage`, `_auto`, and others), `merge_documents`, `_llm_json` (OpenRouter over `urllib`).
- Depends on: PDF text helper `_page_text`; environment variables `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`.
- Used by: `case_api._parsed`, and `parse_packet` for batch use.

**Workflow:**
- Purpose: Decide what the taxpayer must still answer and which documents to request, then build `FinancialData`.
- Location: `src/intake_workflow.py`
- Contains: `INITIAL_QUESTION_IDS`, `_REQUESTS` (`DocumentRequest` table), `missing_question_ids`, `missing_financial_columns`, `financial_data_from_case_row`, `evaluate_case`.
- Depends on: `determination`, `financial_data`, `questions`, `standards_repository` (type only).
- Used by: `case_api`, tests.

**Domain / calculation:**
- Purpose: Form 433-A(OIC) arithmetic and resolution-path selection.
- Location: `src/determination.py`, `src/financial_data.py`
- Contains: `calculate_gross_monthly_income`, `calculate_allowable_expenses`, `calculate_net_disposable_income`, `calculate_net_realizable_equity`, `passes_compliance_gate`, `determine_resolution_path`, and the `Determination` dataclass.
- Depends on: `standards` (facade only). It does not import `psycopg` or any database module.
- Used by: `intake_workflow.evaluate_case`, `demo.py`.

**Data access (standards):**
- Purpose: Retrieve IRS standard amounts and location mappings.
- Location: `src/standards.py` (facade), `src/standards_repository.py` (Protocol and Postgres implementation), `src/schemas/`.
- Depends on: a caller-supplied DB-API connection (`psycopg`), imported lazily inside `case_api._from_database`.
- Used by: `determination.py`.

## Data Flow

### Primary Request Path (screening a case)

1. The user answers questions in `src/frontend/src/app.ts`. Answers are normalized by `parseAnswer` in `src/frontend/src/flow.ts`.
2. Documents are attached per category on the upload screen (`src/frontend/src/document-upload/screen.ts`).
3. `processCase` in `src/frontend/src/case-processing.ts` builds a `FormData` and POSTs to `/api/cases`. Vite proxies `/api` to `127.0.0.1:8000` (`src/frontend/vite.config.js`).
4. `_Handler` in `src/case_api.py` calls `response_for`, which calls `_read_form` to split answers, files, and metadata.
5. `_parsed` runs `document_parse.parse_uploads`. Extracted values are merged over the answers into one row (`case_api.case_result`).
6. `result_for_row` calls `intake_workflow.evaluate_case(row, repository)`. If no repository was injected, `_from_database` opens a `psycopg` connection to `DATABASE_URL` and builds `PostgresStandardsRepository`.
7. `evaluate_case` returns either `information_needed` (missing questions or columns) or a determination from `determination.determine_resolution_path`.
8. `_PATHS` maps the determination path string to an outcome id. `_payload` returns `caseLabel`, `outcome`, `documents`, and `financialSections`.
9. The browser validates the JSON with `isCaseResult` and renders it with `renderResolutionResults` (`src/frontend/src/resolution-results/screen.ts`).

### Standards Lookup

1. `determination.calculate_allowable_expenses` calls the `standards.*` functions with the repository.
2. Each repository method in `src/standards_repository.py` runs one parameterized SQL query against tables defined in `src/schemas/database_schema.sql` (for example `national_standards`, `msa_county_standards`, `state_aliases`).
3. A missing row raises `StandardsLookupError`, which `case_api` converts into an "unresolved" outcome instead of a crash.

### Demo Flow

1. `src/demo.py` builds `FinancialData` fixtures and calls `determine_resolution_path` and `calculate_allowable_expenses` directly with a `PostgresStandardsRepository`.

**State Management:**
- Browser: module-level state inside `createApp` in `src/frontend/src/app.ts`; no store library.
- Server: stateless per request. No sessions, no cache.
- Persistence: none in the request path; the schema is defined but unused by the code reviewed.

## Key Abstractions

**`FinancialData`:**
- Purpose: Canonical per-case facts, one field per Form 433-A line.
- Examples: `src/financial_data.py`
- Pattern: `@dataclass` with defaults. `REQUIRED_FINANCIAL_COLUMNS` in `src/intake_workflow.py` derives required fields from it.

**`StandardsRepository`:**
- Purpose: Swappable source of IRS standards.
- Examples: `src/standards_repository.py` (Protocol and `PostgresStandardsRepository`); test fakes in `src/tests/test_intake_workflow.py` (`STANDARDS`).
- Pattern: `typing.Protocol` with structural typing; no inheritance required.

**`Determination`:**
- Purpose: Output of the calculator (path, reason, NDI, equity, suggested offer or payment, review notes).
- Examples: `src/determination.py`
- Pattern: dataclass returned by `determine_resolution_path`.

**`QUESTIONS`:**
- Purpose: Declarative intake questions with type and applicability.
- Examples: `src/questions.py` (server), `src/frontend/src/questions.ts` (browser).
- Pattern: plain dict list on the server; typed objects with `isApplicable` and `valueType` in the browser.

**`DocumentRequest`:**
- Purpose: Describes one document the taxpayer must upload and why.
- Examples: `src/intake_workflow.py` (`_REQUESTS`), mirrored in `src/frontend/src/document-upload/requests.ts`.
- Pattern: frozen dataclass table keyed by code.

## Entry Points

**Backend HTTP server:**
- Location: `src/case_api.py` (`main`, binds `127.0.0.1:8000`)
- Triggers: `python src/case_api.py` run by the developer; receives `POST /api/cases`.
- Responsibilities: multipart parsing, orchestration, JSON response.

**Frontend bootstrap:**
- Location: `src/frontend/src/main.ts` (loaded by `src/frontend/index.html`)
- Triggers: Vite dev server (`npm run dev`) or the static `src/frontend/dist/`.
- Responsibilities: mounts `createApp` on `#app`.

**Calculator demo:**
- Location: `src/demo.py`
- Triggers: `python src/demo.py` (needs `DATABASE_URL`).
- Responsibilities: prints worked scenarios.

**Document parsing:**
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

**What happens:** Amounts or area mappings written as constants inside Python modules.
**Why it's wrong:** Violates the repository rule in `CLAUDE.md`; standards become unauditable and stale.
**Do this instead:** Add the value to `src/schemas/lookup_standards.seed.sql`, expose it through a method on `PostgresStandardsRepository` in `src/standards_repository.py`, and call it via `src/standards.py`.

### Defaulting unknown facts to zero

**What happens:** Code treats `None` as `0`, or relies on `FinancialData` defaults for a value the taxpayer never supplied.
**Why it's wrong:** `FinancialData` defaults (for example `household_size: int = 1`) can mask unanswered questions. The intake layer relies on `None` to detect gaps (`missing_question_ids`, `missing_financial_columns` in `src/intake_workflow.py`).
**Do this instead:** Read values from the canonical row in `src/intake_workflow.py` and keep unknowns as `None` until evaluation confirms they are present.

### A second case-data path

**What happens:** A new endpoint or module builds its own dict of case fields.
**Why it's wrong:** It bypasses `financial_data_from_case_row` and the missing-data checks.
**Do this instead:** Route through `case_api.result_for_row` → `intake_workflow.evaluate_case`.

## Error Handling

**Strategy:** Convert domain failures into structured outcomes rather than HTTP errors. Only malformed requests return a non-200 status.

**Patterns:**
- Bad multipart or validation failures raise `ValueError`, and `response_for` returns `400 {"error": ...}`.
- Missing standards raise `LookupError` / `StandardsLookupError`. `result_for_row` converts them into an "unresolved" outcome (`_unresolved`) with status `manual_review`.
- Document parse problems are collected as `errors` and surfaced as review notes through `_file_notes`.
- Frontend: `processCase` rejects on a non-OK response or an invalid shape, and `app.ts` shows the error message.

## Cross-Cutting Concerns

**Logging:** `print` in `src/demo.py`; no logging framework in the server path.
**Validation:**
- Server: `validate_answer` in `src/intake_workflow.py` checks Python types against `QUESTIONS`; `_COUNTS` in `src/case_api.py` lists count fields.
- Browser: `validateAnswer` in `src/frontend/src/flow.ts`; `isCaseResult` in `src/frontend/src/case-processing.ts`.

**Authentication:** None. The server binds to localhost only and the frontend has no auth flow. The Supabase client is unused.
**Compliance messaging:** `_NEXT` in `src/case_api.py` states that a tax professional must review results before filing.

---

*Architecture analysis: 2026-10-10*
