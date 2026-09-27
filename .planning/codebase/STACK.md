# Technology Stack

**Analysis Date:** 2026-09-27

## Languages

**Primary:**
- Python 3.10+ syntax, with Python 3.11.15 available in the analyzed environment - backend HTTP handling, intake orchestration, PDF parsing, deterministic screening, and PostgreSQL standards access in `src/*.py`. No Python version file or packaging manifest pins the runtime; `src/case_api.py` and `src/document_parse.py` use modern union-type syntax.
- TypeScript 5.9.3 resolved (`^5.7.3` declared) - browser intake, upload, and results application in `src/frontend/src/`, configured by `src/frontend/tsconfig.json` and locked by `src/frontend/package-lock.json`.

**Secondary:**
- SQL for PostgreSQL 14+ - relational schema and IRS standards seed data in `src/schemas/database_schema.sql` and `src/schemas/lookup_standards.seed.sql`.
- JavaScript ES modules - Vite configuration and the county-data generator in `src/frontend/vite.config.js` and `src/frontend/scripts/generate-counties.mjs`.
- HTML and CSS - the Vite entry document and application styling in `src/frontend/index.html`, `src/frontend/src/styles.css`, and `src/frontend/src/resolution-results/styles.css`.

## Runtime

**Environment:**
- CPython; the source requires Python 3.10 or newer syntax, while repository documentation does not pin a version in `README.md` or a Python manifest. The analyzed shell provides Python 3.11.15 for code under `src/`.
- Node.js 18 or newer is required by `src/frontend/package.json`; the analyzed shell provides Node.js 24.14.0.
- PostgreSQL 14 or newer is required for database-backed standards lookups and schema application per `README.md` and `src/schemas/database_schema.sql`.
- The local API uses Python's threaded standard-library server bound to `127.0.0.1:8000` in `src/case_api.py`; this is a development runtime, not a production application server declaration.

**Package Manager:**
- npm 11.9.0 is available in the analyzed environment; frontend scripts and dependency declarations live in `src/frontend/package.json`.
- Lockfile: present at `src/frontend/package-lock.json` using lockfile version 3.
- Python package manager metadata: missing; there is no `requirements.txt`, `pyproject.toml`, `Pipfile`, `poetry.lock`, or equivalent alongside `src/`. The optional `psycopg` runtime dependency is documented in `README.md` but not reproducibly pinned.

## Frameworks

**Core:**
- Vite 6.4.3 resolved (`^6.1.0` declared) - frontend development server, `/api` proxy, and production bundling configured in `src/frontend/vite.config.js`.
- Vanilla browser TypeScript - DOM rendering and state transitions are implemented directly in `src/frontend/src/app.ts`, `src/frontend/src/flow.ts`, and `src/frontend/src/main.ts`; there is no React, Vue, Angular, or other SPA framework.
- Material Web 2.5.0 - outlined-select web components imported by `src/frontend/src/app.ts` and declared in `src/frontend/package.json`.
- Python standard library `http.server` - multipart `POST /api/cases` service implemented with `BaseHTTPRequestHandler` and `ThreadingHTTPServer` in `src/case_api.py`.

**Testing:**
- Python `unittest` from the standard library - backend tests under `src/tests/`, run with the discovery command documented in `README.md` and `AGENTS.md`.
- Vitest 5.0.2 - frontend unit and DOM tests under `src/frontend/src/**/*.test.ts`, configured by `src/frontend/vitest.config.ts`.
- jsdom 26.1.0 - DOM environment dependency declared in `src/frontend/package.json` and locked in `src/frontend/package-lock.json` for frontend tests.

**Build/Dev:**
- TypeScript compiler 5.9.3 resolved - strict, no-emit type checking before builds via `tsc --noEmit` in `src/frontend/package.json`; compiler options are in `src/frontend/tsconfig.json`.
- Vite 6.4.3 - `npm run dev` serves the frontend and `npm run build` produces the browser bundle as defined in `src/frontend/package.json`.
- Node standard library script - `npm run generate:counties` reads `src/schemas/lookup_standards.seed.sql` and regenerates `src/frontend/src/counties.generated.ts` through `src/frontend/scripts/generate-counties.mjs`.

## Key Dependencies

**Critical:**
- `@material/web` 2.5.0 - the only declared frontend runtime package; used for select controls in `src/frontend/src/app.ts`.
- `psycopg` 3.x - PostgreSQL driver imported lazily by `src/case_api.py` and `src/demo.py`. It is required only when performing database-backed standards lookups, is named in `README.md`, and has no repository-level version constraint.
- PostgreSQL 14+ - stores dynamic IRS standards consumed by `src/standards_repository.py`; schema requirements are declared in `src/schemas/database_schema.sql`.

**Infrastructure:**
- No PDF library dependency is declared. `src/document_parse.py` implements targeted ReportLab-style PDF stream decoding with standard-library `base64`, `zlib`, and regular expressions.
- Poppler `pdftotext -layout` is mentioned as a need for unsupported PDF generators in the module notes in `src/document_parse.py`, but the application does not invoke it and no installation automation is present.
- `urllib.request` is used directly for the Sciforium chat-completions fallback in `src/document_parse.py`; there is no vendor SDK dependency.

## Configuration

**Environment:**
- `DATABASE_URL` supplies the PostgreSQL connection string to `src/case_api.py` and `src/demo.py`.
- `SCIFORIUM_API_KEY` supplies bearer authentication and `SCIFORIUM_API_ENDPOINT` supplies the model identifier for the optional extraction fallback in `src/document_parse.py`.
- A root `.env` file is present and gitignored by `.gitignore`; its contents were not read. `src/document_parse.py` may load this file when the Sciforium variables are absent from the process environment.
- A tracked `.env.example` is present as an environment template; its contents were not read. Runtime variable names were established from `src/case_api.py`, `src/demo.py`, and `src/document_parse.py`.

**Build:**
- `src/frontend/tsconfig.json` targets ES2022, uses ESNext modules and bundler resolution, enables strict checking, and disables emit.
- `src/frontend/vite.config.js` proxies `/api` to `http://127.0.0.1:8000` during development.
- `src/frontend/vitest.config.ts` registers `src/frontend/src/test-setup.ts`; the setup replaces Material Web select components with a lightweight test custom element.
- `src/frontend/package.json` defines `generate:counties`, `dev`, `build`, and `test`; `src/frontend/package-lock.json` is the reproducible frontend dependency lock.

## Platform Requirements

**Development:**
- Use Python 3.10+ for `src/`; use Python 3.11 if matching the analyzed environment. Run backend tests with `python -m unittest discover -s src/tests -v` as documented in `AGENTS.md`.
- Use Node.js 18+ and npm in `src/frontend/`; install dependencies before `npm test`, `npm run dev`, or `npm run build` according to `src/frontend/README.md`. `src/frontend/node_modules/` is currently absent.
- Install PostgreSQL 14+ client/server tooling and `psycopg` before database-backed execution; apply `src/schemas/database_schema.sql` before `src/schemas/lookup_standards.seed.sql` as documented in `README.md`.
- Start `src/case_api.py` before the Vite dev server when exercising the full browser flow; the proxy relationship is configured in `src/frontend/vite.config.js`.

**Production:**
- No production hosting, container, process-manager, reverse-proxy, or deployment configuration is present. `src/case_api.py` binds a standard-library development server only to loopback, and `src/frontend/package.json` supplies a frontend build command without a deployment target.
- Submitted case data and uploaded documents are not persisted by the current HTTP runtime: `src/case_api.py` writes uploads to a `TemporaryDirectory`, calls `src/document_parse.py`, and returns JSON. The durable tables in `src/schemas/database_schema.sql` are defined but are not written by `src/case_api.py`.

---

*Stack analysis: 2026-09-27*
