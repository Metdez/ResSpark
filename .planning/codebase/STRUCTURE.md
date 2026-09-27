# Codebase Structure

**Analysis Date:** 2026-09-27

## Directory Layout

```text
New Tax Proplem/
├── .planning/
│   └── codebase/                    # Generated GSD codebase reference maps
├── examples/                        # Synthetic PDF packets for three scenarios
│   ├── 01_marcus_delgado_CNC/
│   ├── 02_whitfield_gregory_OIC/
│   └── 03_renata_alves_streamlined_IA/
├── forms/                           # IRS form and standards reference PDFs
├── planning/                        # Product/UI design notes and reference images
│   ├── mobbin-style-reference/
│   ├── old/
│   └── taxpayer-intake-ui/
├── src/                             # Python backend/domain implementation
│   ├── case_api.py                  # Local HTTP API and response composition
│   ├── demo.py                      # Database-backed CLI scenarios
│   ├── determination.py             # Deterministic screening engine
│   ├── document_parse.py            # PDF classification and extraction pipeline
│   ├── financial_data.py            # Canonical domain dataclass
│   ├── intake_workflow.py           # Intake/missing-data orchestration
│   ├── questions.py                 # Backend question declarations
│   ├── standards.py                 # Lookup facade
│   ├── standards_repository.py      # Repository protocol/PostgreSQL adapter
│   ├── frontend/                    # Vite + vanilla TypeScript client
│   │   ├── scripts/                 # Build-time data generators
│   │   ├── src/                     # Browser modules, styles, and tests
│   │   │   ├── document-upload/     # Upload request rules and view
│   │   │   └── resolution-results/  # Result DTO and view
│   │   ├── index.html               # Browser HTML entry
│   │   ├── package.json             # Frontend scripts/dependencies
│   │   ├── tsconfig.json            # Strict TypeScript configuration
│   │   └── vite.config.js           # Dev server and `/api` proxy
│   ├── schemas/                     # PostgreSQL DDL and standards seed
│   └── tests/                       # Python `unittest` suite
├── AGENTS.md                        # Contributor rules and safety constraints
├── README.md                        # Project overview and run instructions
└── .gitignore                       # Local dependency/cache/secret exclusions
```

## Directory Purposes

**`.planning/codebase/`:**
- Purpose: Store generated architecture, structure, stack, conventions, testing, and concern maps consumed by GSD workflows.
- Contains: Markdown analysis documents such as `.planning/codebase/ARCHITECTURE.md` and `.planning/codebase/STRUCTURE.md`.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`

**`src/`:**
- Purpose: Hold all executable Python application, workflow, parsing, domain, and infrastructure code.
- Contains: Flat Python modules for each layer plus the nested frontend, schemas, and backend tests.
- Key files: `src/case_api.py`, `src/intake_workflow.py`, `src/document_parse.py`, `src/financial_data.py`, `src/determination.py`, `src/standards_repository.py`

**`src/frontend/`:**
- Purpose: Isolate the independently built taxpayer-facing browser application.
- Contains: Vite configuration, strict TypeScript source, CSS, tests, generated county data, and npm metadata.
- Key files: `src/frontend/index.html`, `src/frontend/package.json`, `src/frontend/tsconfig.json`, `src/frontend/vite.config.js`, `src/frontend/src/main.ts`, `src/frontend/src/app.ts`

**`src/frontend/src/`:**
- Purpose: Contain browser runtime code and co-located Vitest suites.
- Contains: Application shell, question definitions, flow helpers, submission client, feature directories, CSS, and `*.test.ts` files.
- Key files: `src/frontend/src/app.ts`, `src/frontend/src/questions.ts`, `src/frontend/src/flow.ts`, `src/frontend/src/case-processing.ts`, `src/frontend/src/styles.css`

**`src/frontend/src/document-upload/`:**
- Purpose: Own upload requirement selection and the document collection screen.
- Contains: Pure request rules, DOM rendering/event logic, and focused tests.
- Key files: `src/frontend/src/document-upload/requests.ts`, `src/frontend/src/document-upload/screen.ts`, `src/frontend/src/document-upload/requests.test.ts`, `src/frontend/src/document-upload/screen.test.ts`

**`src/frontend/src/resolution-results/`:**
- Purpose: Own the API result type and finished-screen rendering.
- Contains: DTO interfaces, DOM rendering, feature CSS, and rendering tests.
- Key files: `src/frontend/src/resolution-results/model.ts`, `src/frontend/src/resolution-results/screen.ts`, `src/frontend/src/resolution-results/styles.css`, `src/frontend/src/resolution-results/screen.test.ts`

**`src/frontend/scripts/`:**
- Purpose: Generate checked-in frontend data assets outside the runtime bundle.
- Contains: Node-based generator for county options.
- Key files: `src/frontend/scripts/generate-counties.mjs`, output `src/frontend/src/counties.generated.ts`

**`src/schemas/`:**
- Purpose: Define PostgreSQL canonical case/evidence structures and the database-backed dynamic standards dataset.
- Contains: Transactional DDL, normalization functions, lookup indexes, large generated seed SQL, and application notes.
- Key files: `src/schemas/database_schema.sql`, `src/schemas/lookup_standards.seed.sql`, `src/schemas/README.md`

**`src/tests/`:**
- Purpose: Verify Python API composition, document extraction, workflow gating, and deterministic path selection without a live database.
- Contains: Standard-library `unittest` modules and a fake standards repository in `src/tests/test_intake_workflow.py`.
- Key files: `src/tests/test_case_api.py`, `src/tests/test_document_parse.py`, `src/tests/test_intake_workflow.py`

**`examples/`:**
- Purpose: Provide synthetic document packets exercised by parsers/tests and demonstrating expected resolution scenarios.
- Contains: PDFs grouped by numbered scenario directories.
- Key files: `examples/01_marcus_delgado_CNC/01_IRS_Account_Transcript.pdf`, `examples/02_whitfield_gregory_OIC/01_IRS_Account_Transcript.pdf`, `examples/03_renata_alves_streamlined_IA/01_IRS_Account_Transcript.pdf`

**`forms/`:**
- Purpose: Store authoritative-looking IRS form and standards PDFs used as local reference material.
- Contains: Forms 433-A/433-D/433-F/9465 and standards PDFs.
- Key files: `forms/f433aoi.pdf`, `forms/f433d.pdf`, `forms/national-standards.pdf`, `forms/transportation-standards.pdf`

**`planning/`:**
- Purpose: Store non-runtime UI direction, flow notes, screenshots, and archived documentation.
- Contains: Markdown briefs and image references; no application imports target this directory.
- Key files: `planning/taxpayer-question-flow.md`, `planning/taxpayer-intake-ui/brand-direction.md`, `planning/mobbin-style-reference/STYLE.md`

## Key File Locations

**Entry Points:**
- `src/frontend/index.html`: Loads the browser module at `/src/main.ts` into `#app`.
- `src/frontend/src/main.ts`: Validates the root element and calls `createApp`.
- `src/case_api.py`: Runs the local threaded HTTP server and owns `POST /api/cases`.
- `src/demo.py`: Runs fixed screening scenarios through the production determination engine.
- `src/schemas/database_schema.sql`: Starts the database bootstrap sequence.

**Configuration:**
- `AGENTS.md`: Repository-specific architecture, safety, implementation, and testing rules.
- `src/frontend/package.json`: Node engine, frontend scripts, Material Web dependency, and build/test tooling.
- `src/frontend/tsconfig.json`: Strict ES2022 browser TypeScript settings.
- `src/frontend/vite.config.js`: Proxies `/api` to `http://127.0.0.1:8000` during development.
- `src/frontend/vitest.config.ts`: Loads `src/frontend/src/test-setup.ts` for browser tests.
- `.gitignore`: Excludes `.env`, Python caches, virtual environments, and `node_modules`.
- `.env`: Present for local environment configuration; never read or commit its contents.
- `.env.example`: Present as an environment configuration example; keep actual credentials outside version control.

**Core Logic:**
- `src/financial_data.py`: Canonical `FinancialData` input model.
- `src/determination.py`: Only location for resolution calculations and decision-tree selection.
- `src/intake_workflow.py`: Applicability, completeness, requests, review flags, and domain handoff.
- `src/questions.py`: Backend taxpayer-question contract.
- `src/document_parse.py`: Document-content classification and extraction.
- `src/standards.py`: Domain-facing standards functions.
- `src/standards_repository.py`: Standards persistence port and PostgreSQL adapter.
- `src/frontend/src/app.ts`: Browser screen coordinator.
- `src/frontend/src/questions.ts`: Frontend question contract.
- `src/frontend/src/document-upload/requests.ts`: Frontend document applicability rules.
- `src/frontend/src/case-processing.ts`: Browser/API boundary.

**Data Definitions:**
- `src/schemas/database_schema.sql`: Canonical case, evidence, determination, and standards schema.
- `src/schemas/lookup_standards.seed.sql`: Generated population of standards/location lookup data.
- `src/frontend/src/counties.generated.ts`: Generated state/county options consumed by frontend questions.

**Testing:**
- `src/tests/test_intake_workflow.py`: Workflow, calculations, and fake repository tests.
- `src/tests/test_document_parse.py`: PDF/template/classification/fallback tests.
- `src/tests/test_case_api.py`: Multipart/API response and example-packet integration tests.
- `src/frontend/src/app.test.ts`: Full browser screen-flow tests.
- `src/frontend/src/flow.test.ts`: Pure answer applicability/validation tests.
- `src/frontend/src/case-processing.test.ts`: Multipart submission and runtime response-validation tests.
- `src/frontend/src/document-upload/*.test.ts`: Upload request/view behavior tests.
- `src/frontend/src/resolution-results/screen.test.ts`: Result rendering and escaping tests.

**Documentation:**
- `README.md`: Current user/developer overview and run commands.
- `src/frontend/README.md`: Frontend runtime, payload, and feature-boundary notes.
- `src/schemas/README.md`: Schema/seed application order.
- `planning/old/root-README.md`, `planning/old/src-README.md`: Archived documentation only; do not use as current implementation guidance.

## Naming Conventions

**Files:**
- Use lowercase `snake_case.py` for Python modules, as in `src/intake_workflow.py` and `src/standards_repository.py`.
- Use lowercase kebab-case for multiword frontend feature files/directories, as in `src/frontend/src/case-processing.ts`, `src/frontend/src/document-upload/`, and `src/frontend/src/resolution-results/`.
- Co-locate frontend tests with the module and suffix them `.test.ts`, as in `src/frontend/src/flow.test.ts`.
- Keep backend tests under `src/tests/` and prefix them `test_`, as in `src/tests/test_case_api.py`.
- Mark generated source explicitly with `.generated.ts`, as in `src/frontend/src/counties.generated.ts`.
- Use uppercase names for generated GSD reference documents under `.planning/codebase/`, as in `.planning/codebase/ARCHITECTURE.md`.

**Directories:**
- Use lowercase feature nouns and kebab-case for multiword frontend features: `src/frontend/src/document-upload/`, `src/frontend/src/resolution-results/`.
- Keep executable backend modules directly under `src/`; create a subdirectory only for a cohesive boundary such as `src/schemas/`, `src/tests/`, or `src/frontend/`.
- Keep synthetic fixtures grouped by numbered scenario and expected path under `examples/`, following `examples/01_marcus_delgado_CNC/`.

**Python Symbols:**
- Use `snake_case` for public functions and fields, matching database columns: `determine_resolution_path`, `gross_wages_taxpayer` in `src/determination.py`/`src/financial_data.py`.
- Use a leading underscore for module-private helpers/constants: `_screenable`, `_PATHS` in `src/case_api.py`.
- Use `PascalCase` for dataclasses, protocols, adapters, and exceptions: `FinancialData`, `WorkflowResult`, `StandardsRepository`, `PostgresStandardsRepository` in `src/*.py`.

**TypeScript Symbols:**
- Use `camelCase` for functions and variables: `createApp`, `getDocumentRequests`, `sortedUploads` in `src/frontend/src/`.
- Use `PascalCase` for interfaces and union aliases: `QuestionDefinition`, `CaseProcessor`, `ResolutionCaseResult` in `src/frontend/src/`.
- Use stable `snake_case` strings only where values mirror backend canonical field IDs, as in `filing_status_married` in `src/frontend/src/questions.ts`.

**Database Objects:**
- Use plural `snake_case` table names and `snake_case` columns: `case_financial_data`, `document_extractions`, `monthly_amount` in `src/schemas/database_schema.sql`.
- Name lookup indexes for their table/use: `housing_utilities_lookup_idx`, `documents_case_id_idx` in `src/schemas/database_schema.sql`.

## Where to Add New Code

**New Backend Feature:**
- Primary code: Add orchestration at the narrowest existing module in `src/`; use `src/intake_workflow.py` for intake/gating, `src/document_parse.py` for extraction, and `src/determination.py` only for deterministic tax calculations.
- Tests: Add focused coverage to the matching `src/tests/test_*.py` module; create `src/tests/test_<module>.py` for a genuinely new backend module.

**New Frontend Feature:**
- Primary code: Create a cohesive kebab-case directory under `src/frontend/src/<feature>/` when the feature has its own model/view/tests; wire navigation from `src/frontend/src/app.ts`.
- Tests: Co-locate `*.test.ts` beside the feature implementation under `src/frontend/src/<feature>/`.
- Types: Keep network-facing DTOs with the consuming feature, following `src/frontend/src/resolution-results/model.ts`.

**New Question:**
- Backend declaration: Update `src/questions.py` and, where applicability or initial ordering changes, `src/intake_workflow.py`.
- Frontend declaration: Update `src/frontend/src/questions.ts`; retain canonical field IDs shared with the backend.
- Database mapping: Update `question_definitions` and `case_financial_data` in `src/schemas/database_schema.sql` if a new canonical field is required.
- Tests: Update both `src/tests/test_intake_workflow.py` and relevant `src/frontend/src/app.test.ts`/`src/frontend/src/flow.test.ts` tests. Treat the existing contract mismatch described in `src/frontend/README.md` as intentional current state until explicitly revised.

**New Document Type:**
- Backend extraction: Add classification, owned fields, parser/fallback validation, and aggregation in `src/document_parse.py`.
- Backend request mapping: Add the request in `src/intake_workflow.py` and missing-field mapping in `src/case_api.py`.
- Frontend request: Add applicability in `src/frontend/src/document-upload/requests.ts`; update filename assistance in `src/frontend/src/document-upload/screen.ts` only as a UI convenience.
- Tests: Extend `src/tests/test_document_parse.py`, `src/tests/test_case_api.py`, and `src/frontend/src/document-upload/*.test.ts`.

**New Resolution Rule:**
- Primary code: Implement only in `src/determination.py`, using facts from `src/financial_data.py` and standards obtained through `src/standards.py`.
- API mapping: Add any new display identifier/path mapping to `_PATHS` in `src/case_api.py` and the TypeScript union in `src/frontend/src/resolution-results/model.ts`.
- Tests: Cover normal, boundary, and missing-data behavior in `src/tests/test_intake_workflow.py` plus UI display in `src/frontend/src/resolution-results/screen.test.ts`.

**New Standards Lookup:**
- Schema/data: Define the lookup table or seed change in `src/schemas/database_schema.sql` and `src/schemas/lookup_standards.seed.sql`.
- Repository: Extend `StandardsRepository` and `PostgresStandardsRepository` in `src/standards_repository.py`, then add a facade function in `src/standards.py`.
- Tests: Extend the fake repository in `src/tests/test_intake_workflow.py` and verify parameters without requiring a live database.

**New API Endpoint:**
- Routing and translation: Add request handling near `_Handler` in `src/case_api.py`, but extract non-HTTP behavior into a named function/module under `src/` so it remains unit-testable.
- Client access: Add a typed adapter under `src/frontend/src/` rather than embedding `fetch` calls in a DOM renderer, following `src/frontend/src/case-processing.ts`.
- Tests: Add backend behavior to `src/tests/test_case_api.py` and client contract tests beside the new TypeScript adapter.

**Utilities:**
- Backend shared helpers: Keep domain-specific helpers in their owning `src/*.py` module; create a new `src/<purpose>.py` only when reused across multiple layers.
- Frontend pure helpers: Keep them beside the feature, following `src/frontend/src/flow.ts`; avoid a generic catch-all utilities file.
- Generated data: Put generators in `src/frontend/scripts/` and generated runtime source in `src/frontend/src/*.generated.ts`.

## Special Directories

**`examples/`:**
- Purpose: Synthetic client document packets for parser and scenario validation.
- Generated: No.
- Committed: Yes; never place real taxpayer documents here.

**`forms/`:**
- Purpose: Static IRS reference documents.
- Generated: No.
- Committed: Yes; modify only when the task explicitly updates reference material.

**`planning/`:**
- Purpose: UI/product reference material and archived documentation.
- Generated: No.
- Committed: Yes; runtime code does not belong here.

**`.planning/codebase/`:**
- Purpose: GSD-generated current-state codebase maps.
- Generated: Yes.
- Committed: Intended for planning workflows; repository status determines final commit handling.

**`src/frontend/src/counties.generated.ts`:**
- Purpose: Checked-in state/county option data consumed by `src/frontend/src/questions.ts`.
- Generated: Yes, by `src/frontend/scripts/generate-counties.mjs` via the `generate:counties` script in `src/frontend/package.json`.
- Committed: Yes.

**`src/schemas/lookup_standards.seed.sql`:**
- Purpose: Bulk population of IRS standards and location mappings.
- Generated: Yes; its header records source hashes according to `src/schemas/README.md`.
- Committed: Yes.

**`src/frontend/node_modules/`:**
- Purpose: Local npm dependencies.
- Generated: Yes, by `npm install` in `src/frontend/`.
- Committed: No; excluded by `.gitignore`.

**`__pycache__/` and `venv/`:**
- Purpose: Local Python bytecode and virtual environment files.
- Generated: Yes.
- Committed: No; excluded by `.gitignore`.

**Local `.env`:**
- Purpose: Local environment configuration for database and optional extraction services.
- Generated: No.
- Committed: No; excluded by `.gitignore`. Its contents are sensitive and must not be read into documentation.

---

*Structure analysis: 2026-09-27*
