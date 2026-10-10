---
last_mapped_commit: ba83e4e43838595a38647e26882014745b62d476
last_mapped_at: 2026-10-10
---
# Codebase Structure

**Analysis Date:** 2026-10-10

## Directory Layout

```
Tax Proplem/                          # repository root
├── src/                              # Python backend + TypeScript frontend
│   ├── case_api.py                   # HTTP server, POST /api/cases (entry point)
│   ├── document_parse.py             # PDF classification and extraction (954 lines)
│   ├── intake_workflow.py            # Question ordering, doc requests, evaluate_case
│   ├── determination.py              # IRS screening math and path selection
│   ├── financial_data.py             # FinancialData dataclass (Form 433-A lines)
│   ├── questions.py                  # 32 server-side intake questions
│   ├── standards.py                  # Standards facade over repository
│   ├── standards_repository.py       # StandardsRepository Protocol + PostgreSQL impl
│   ├── demo.py                       # Worked calculator scenarios
│   ├── schemas/                      # SQL schema and standards seed data
│   ├── tests/                        # unittest suites
│   └── frontend/                     # Vite + TypeScript SPA
├── docs/                             # Mirrors source paths for per-file Markdown docs
│   └── src/frontend/src/supabase/client.md
├── examples/                         # Synthetic client packets (PDFs), 3 folders
├── forms/                            # Reference IRS form and standards PDFs
├── planning/                         # Design notes and reference images (not code)
├── .planning/codebase/               # Generated codebase maps (this document set)
├── .agents/skills/                   # Agent skill packages (Supabase guidance)
├── .claude/                          # Claude Code project settings
├── .sandboxes/                       # Local experiment copies (not part of the product)
├── Discovery/                        # Research and discovery material (not part of the product)
├── AGENTS.md / CLAUDE.md             # Contributor and agent guides
├── README.md                         # Project overview
├── Logics_API_Documentation.docx.md  # IRS Logics API reference notes
└── skills-lock.json                  # Agent skills lockfile
```

Note: `CLAUDE.md` refers to `Context/` and `Examples/`. The repository has no `Context/` directory, and the packet folder is `examples/` (lowercase).

## Directory Purposes

**`src/` (Python package root):**
- Purpose: All backend modules. Imports are flat (`from determination import ...`), so scripts run with `src/` as the working or script directory.
- Contains: Modules listed above plus `__pycache__/` (generated).
- Key files: `src/case_api.py`, `src/intake_workflow.py`, `src/determination.py`.

**`src/schemas/`:**
- Purpose: PostgreSQL schema and standards data.
- Contains: `database_schema.sql` (tables: `cases`, `question_definitions`, `case_financial_data`, `state_aliases`, `county_suffixes`, `housing_utilities_standards`, `msa_county_standards`, `state_region_standards`, `national_standards`, `health_care_standards`, `transportation_ownership_standards`, `transportation_operating_standards`, `documents`, `document_extractions`, `determination_runs`), `lookup_standards.seed.sql`, `README.md`.
- Key files: `src/schemas/database_schema.sql`, `src/schemas/lookup_standards.seed.sql`.

**`src/tests/`:**
- Purpose: `unittest` coverage for the backend.
- Contains: `test_case_api.py`, `test_document_parse.py`, `test_intake_workflow.py`. Test helpers such as `canonical_zero_row` and `STANDARDS` live in `test_intake_workflow.py` and are imported by `test_case_api.py`.
- Generated: `__pycache__/` files are present; they are not source.

**`src/frontend/`:**
- Purpose: Browser app built with Vite, TypeScript, `@material/web`, and `@supabase/supabase-js`.
- Contains: `index.html`, `vite.config.js`, `vitest.config.ts`, `tsconfig.json`, `package.json`, `scripts/generate-counties.mjs`, `src/`, `dist/` (built output), `node_modules/` (installed dependencies, not committed).
- Key files: `src/frontend/src/main.ts`, `src/frontend/src/app.ts`, `src/frontend/src/case-processing.ts`.

**`src/frontend/src/`:**
- Purpose: Application modules, grouped by screen.
- Contains:
  - Top level: `app.ts` (controller), `flow.ts` (answer helpers), `questions.ts` (question declarations), `case-processing.ts` (API client), `counties.generated.ts` (generated county data), `styles.css`, `test-setup.ts`.
  - `document-upload/`: `screen.ts`, `requests.ts`, `screen.test.ts`, `requests.test.ts`.
  - `resolution-results/`: `screen.ts`, `model.ts`, `styles.css`, `screen.test.ts`.
  - `supabase/`: `client.ts` (unused).
  - Tests colocated: `app.test.ts`, `flow.test.ts`, `case-processing.test.ts`.

**`src/frontend/dist/`:**
- Purpose: Production build output from `vite build`.
- Generated: Yes. Committed: treat as build output; do not edit by hand.

**`docs/`:**
- Purpose: Per-file Markdown explanations. The convention is to mirror the source path, for example `docs/src/frontend/src/supabase/client.md`.
- Contains: one file currently.

**`examples/`:**
- Purpose: Synthetic client-document packets used for document-parsing tests and the packet batch path.
- Contains: `01_marcus_delgado_CNC/`, `02_whitfield_gregory_OIC/`, `03_renata_alves_streamlined_IA/` (PDF statements, transcripts, pay stubs, leases, loans, insurance).
- Committed: Yes. Synthetic only; not production data.

**`forms/`:**
- Purpose: Reference PDFs: Form 433-A (`f433a (1).pdf`), Form 433-A(OIC) (`f433aoi.pdf`), Form 433-D (`f433d.pdf`), Form 433-F (`f433f.pdf`), Form 9465 (`f9465.pdf`), and national, housing, transportation, and out-of-pocket health standards PDFs.
- Used by code: No. These are source material for seeding the standards tables.

**`planning/`:**
- Purpose: Product and UI design notes (`taxpayer-intake-ui/`, `mobbin-style-reference/`), old READMEs in `planning/old/`.
- Used by code: No.

**`.sandboxes/`:**
- Purpose: Local experiment copies (`bank-statements-copy/`, `frontend-results-upload-polish/`).
- Used by code: No. Ignore when navigating the product.

**`Discovery/`:**
- Purpose: Discovery notes and related projects (`Data-Labeling/`, `SS/`, `agentic-case-platform/`, `customers.md`).
- Used by code: No. Ignore when navigating the product.

**`.agents/` and `.claude/`:**
- Purpose: Tooling configuration: agent skill packages (`.agents/skills/supabase*`) and Claude Code settings.
- Used by code: No.

## Key File Locations

**Entry Points:**
- `src/case_api.py`: Backend HTTP server (`main`, port 8000).
- `src/frontend/src/main.ts`: Browser bootstrap.
- `src/frontend/index.html`: HTML shell that loads `main.ts`.
- `src/demo.py`: Calculator demo.

**Configuration:**
- `src/frontend/vite.config.js`: Dev server and `/api` proxy to `127.0.0.1:8000`.
- `src/frontend/tsconfig.json`: TypeScript settings.
- `src/frontend/vitest.config.ts`: Frontend test runner.
- `src/frontend/package.json`: Scripts `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`), `generate:counties`.
- `.env.example` and `src/frontend/.env.example`: Environment variable templates. Real `.env` files are not read by this map.
- `.gitignore`: Ignore rules.

**Core Logic:**
- `src/determination.py`: Deterministic screening.
- `src/intake_workflow.py`: Workflow and missing-data rules.
- `src/document_parse.py`: Document extraction.
- `src/financial_data.py`: Canonical fields.
- `src/standards_repository.py`: Standards SQL.

**Testing:**
- `src/tests/`: Backend `unittest` suites. Run with `python -m unittest discover -s src/tests -v`.
- `src/frontend/src/**/*.test.ts`: Frontend Vitest suites, colocated with source.
- `src/frontend/src/test-setup.ts`: Vitest setup.

## Naming Conventions

**Files:**
- Python modules: `snake_case.py` (`case_api.py`, `standards_repository.py`).
- Python tests: `test_<module>.py` in `src/tests/`.
- SQL: `database_schema.sql`; seed data `lookup_standards.seed.sql`.
- TypeScript: `kebab-case.ts` for multi-word modules (`case-processing.ts`, `resolution-results/`); single-word modules are lowercase (`app.ts`, `flow.ts`).
- Frontend tests: `<name>.test.ts` colocated with source.
- Generated files: `*.generated.ts` (`counties.generated.ts`).

**Directories:**
- Python: flat `src/` package with `snake_case` names.
- Frontend: `kebab-case` feature folders under `src/frontend/src/` (`document-upload/`, `resolution-results/`).
- Example packets: `NN_<firstname>_<lastname>_<scenario>/` (for example `01_marcus_delgado_CNC/`).

**Identifiers:**
- Private helpers in Python are prefixed with `_` (`_read_form`, `_from_database`).
- Path outcome strings from the calculator are mapped to IDs through `_PATHS` in `src/case_api.py`.

## Where to Add New Code

**New intake question:**
- Server definition: `src/questions.py` (preserve the 32-question contract unless an intake-version change is requested).
- Applicability and document logic: `src/intake_workflow.py` (`_is_applicable`, `_REQUESTS`, `document_requests_for`).
- Browser declaration: `src/frontend/src/questions.ts`.
- Tests: `src/tests/test_intake_workflow.py`; frontend `src/frontend/src/flow.test.ts`.

**New document type:**
- Classification and extraction: `src/document_parse.py` (add a kind to `_from_kind` and a parser function; keep each parser small).
- Request entry: `_REQUESTS` in `src/intake_workflow.py` and `src/frontend/src/document-upload/requests.ts`.
- Tests: `src/tests/test_document_parse.py` with a fixture from `examples/`.

**New IRS standard or lookup:**
- Schema: `src/schemas/database_schema.sql`.
- Seed data: `src/schemas/lookup_standards.seed.sql`.
- Query method: `PostgresStandardsRepository` in `src/standards_repository.py`, plus a facade function in `src/standards.py`.
- Protocol method: add to `StandardsRepository` and to the test fake.

**New calculation step or path:**
- Implementation: `src/determination.py` (no LLM or heuristic logic; cite the Form 433-A line or policy source in a comment).
- Path mapping: `_PATHS` in `src/case_api.py`.
- Frontend label: `src/frontend/src/resolution-results/`.
- Tests: `src/tests/test_intake_workflow.py` (uses fake standards).

**New frontend screen:**
- Implementation: a new folder under `src/frontend/src/<feature-name>/` with `screen.ts`, `model.ts` or `requests.ts` as needed, and a colocated `screen.test.ts`.
- Wiring: call it from `src/frontend/src/app.ts`.

**New API endpoint:**
- Handler: `_Handler` in `src/case_api.py`. Keep the response builder in a separate function so tests can call it without a socket.

**Shared frontend utilities:**
- Place pure helpers in `src/frontend/src/flow.ts` (answer handling) or a new module next to the screen that uses them.

**Documentation for new code:**
- Create a Markdown file under `docs/` mirroring the source path (for example `src/case_api.py` → `docs/src/case_api.md`), following the existing `docs/src/frontend/src/supabase/client.md` pattern.

**File size:**
- `CLAUDE.md` sets a 500-line limit per code file. `src/document_parse.py` (954 lines) exceeds it and is the first candidate for a split into per-document modules.

## Special Directories

**`src/frontend/node_modules/`:**
- Purpose: Installed npm packages.
- Generated: Yes. Committed: No.

**`src/frontend/dist/`:**
- Purpose: Production build output.
- Generated: Yes. Committed: Present in working tree.

**`src/**/__pycache__/`:**
- Purpose: Python bytecode cache.
- Generated: Yes. Committed: No.

**`.planning/codebase/`:**
- Purpose: Codebase map documents consumed by GSD planning commands.
- Generated: Yes. Committed: depends on project policy.

---

*Structure analysis: 2026-10-10*
