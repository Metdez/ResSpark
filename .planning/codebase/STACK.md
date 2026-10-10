---
last_mapped_commit: ba83e4e43838595a38647e26882014745b62d476
last_mapped_at: 2026-10-10
---
# Technology Stack

**Analysis Date:** 2026-10-10

## Languages

**Primary:**
- Python 3 - Backend: screening logic, document parsing, local HTTP API, DB access. Files: `src/determination.py`, `src/intake_workflow.py`, `src/document_parse.py`, `src/case_api.py`, `src/standards_repository.py`, `src/demo.py`
- TypeScript (ES2022 target, `strict: true`) - Frontend intake and results UI. Files: `src/frontend/src/*.ts`, `src/frontend/src/**/*.ts`, config in `src/frontend/tsconfig.json`
- SQL (PostgreSQL dialect) - Schema and IRS standards seed data. Files: `src/schemas/database_schema.sql`, `src/schemas/lookup_standards.seed.sql`

**Secondary:**
- JavaScript (ESM) - Vite config and a generator script. Files: `src/frontend/vite.config.js`, `src/frontend/scripts/generate-counties.mjs`
- CSS - Frontend styling. Files: `src/frontend/src/styles.css`, `src/frontend/src/resolution-results/styles.css`
- HTML - Frontend entry. File: `src/frontend/index.html`

## Runtime

**Environment:**
- Python 3 (no version pinned; code uses `from __future__ import annotations` and built-in generics such as `list[...]`, so 3.9+ is the practical floor). No `.python-version` detected.
- Node.js `>=18` (declared in `src/frontend/package.json` under `engines`). No `.nvmrc` detected.
- Local dev server for the API: `http.server.ThreadingHTTPServer` on `127.0.0.1:8000` (`src/case_api.py`).

**Package Managers:**
- Python: no manifest (`requirements.txt`, `pyproject.toml`, `Pipfile`, `setup.py` all absent). Only third-party import is `psycopg` (lazy-imported in `src/case_api.py` and `src/demo.py`). Lockfile: missing.
- npm: `src/frontend/package.json`
  - Lockfile: present (`src/frontend/package-lock.json`, lockfileVersion not inspected)

## Frameworks

**Core:**
- No Python web framework. The API is stdlib `http.server` (`BaseHTTPRequestHandler`, `ThreadingHTTPServer`) in `src/case_api.py`, serving `POST /api/cases`.
- Frontend is vanilla TypeScript with no UI framework (no React/Vue/Svelte in `package.json`). Components are `@material/web` web components plus hand-written DOM modules (`src/frontend/src/app.ts`, `src/frontend/src/flow.ts`, `src/frontend/src/document-upload/screen.ts`, `src/frontend/src/resolution-results/screen.ts`).

**Testing:**
- Python: `unittest` (stdlib). Run with `python -m unittest discover -s src/tests -v`. Tests in `src/tests/` (e.g. `src/tests/test_document_parse.py`) use `unittest.mock.patch`.
- Frontend: Vitest `^5.0.2` (lock resolves to 5.0.2) with jsdom `^26.0.0`. Config: `src/frontend/vitest.config.ts` (setup file `src/frontend/src/test-setup.ts`). Test files: `src/frontend/src/*.test.ts`.

**Build/Dev:**
- Vite `^6.1.0` (lock resolves to 6.4.3) - dev server and bundler. Config: `src/frontend/vite.config.js`. Dev server proxies `/api` to `http://127.0.0.1:8000`.
- TypeScript `^5.7.3` (lock resolves to 5.9.3) - type checking via `tsc --noEmit` in the `build` script.

## Key Dependencies

**Critical (frontend runtime):**
- `@supabase/supabase-js` `^2.117.3` (lock resolves to 2.117.3) - Supabase client. Created in `src/frontend/src/supabase/client.ts`.
- `@material/web` `^2.5.0` (lock resolves to 2.5.0) - Material Design web components used for the UI.

**Critical (backend):**
- `psycopg` (v3 API, `import psycopg`) - PostgreSQL driver, not declared in any manifest. Used in `src/case_api.py` and `src/demo.py` to connect via `DATABASE_URL`.
- Python standard library carries the rest: `urllib.request` (OpenRouter and HTTP calls), `zlib` and `base64` (PDF stream decoding in `src/document_parse.py`), `decimal` (money math), `dataclasses`, `http.server`, `pathlib` and `tempfile` for file handling.

**Infrastructure:**
- `jsdom` `^26.0.0` - DOM environment for Vitest.
- `vite` `^6.1.0` and `typescript` `^5.7.3` - listed under devDependencies.

## Configuration

**Environment:**
- Configuration is read from environment variables. A root `.env` file exists (git-ignored via `.gitignore` entry `.env`). Its contents were not read. Variable names documented in templates:
  - Root `.env.example`: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
  - `src/frontend/.env.example`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
  - Read in code but not in a template: `DATABASE_URL` (`src/case_api.py`, `src/demo.py`)
- `src/document_parse.py` loads `.env` itself: it reads the file and calls `os.environ.setdefault` for each entry (around line 434), so existing shell variables take precedence.
- `src/frontend/src/supabase/client.ts` throws at startup if `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is missing. Vite exposes only `VITE_`-prefixed variables to the browser.
- `.gitignore` covers `venv/`, `__pycache__/`, `node_modules/`, `.env`.

**Build:**
- `src/frontend/tsconfig.json` - target ES2022, module ESNext, strict.
- `src/frontend/vite.config.js` - dev proxy.
- `src/frontend/vitest.config.ts` - test setup.
- `src/frontend/scripts/generate-counties.mjs` (npm script `generate:counties`) regenerates `src/frontend/src/counties.generated.ts`.
- Database: `src/schemas/database_schema.sql` and `src/schemas/lookup_standards.seed.sql`, applied with `psql`.

**Cloudflare:**
- No `wrangler.toml`, `wrangler.jsonc`, or Worker/Pages source files are in the repo.
- The project `CLAUDE.md` states that a `CLOUDFLARE_API_TOKEN` is kept in `.env` and that `npx wrangler` or the Cloudflare API is available. The token value was not read.

## Platform Requirements

**Development:**
- Python 3 with `psycopg` installed.
- Node.js 18+ and npm, with `src/frontend/node_modules` installed.
- PostgreSQL reachable through `DATABASE_URL` for database-backed runs. The standards tests use a fake repository and need no database.
- `psql` on PATH to apply the schema and seed files.
- Windows-compatible shell (repo docs use PowerShell syntax such as `$env:DATABASE_URL`).

**Production:**
- Not defined in the repo. No Dockerfile, docker-compose, CI config, or deploy script was found. The Python server is a local dev server (`print("ResSpark case API at http://127.0.0.1:8000/api/cases")`).
- The frontend builds to `src/frontend/dist/` (`npm run build`). A `dist/` directory already exists.

## Other Directories (not analyzed for stack)

- `.sandboxes/` - Sandbox copies of the project, including duplicate `src/frontend/package.json` files. Not part of the main stack.
- `Discovery/` - Not analyzed.
- `examples/` (lowercase in repo root) - Synthetic client-document packets. The `Context/` directory named in the brief was not found at the repo root.
- `forms/`, `planning/` - Not analyzed for stack.
- `.agents/`, `.claude/` - Agent and skill configuration.
- `src/frontend/node_modules/` - Vendored dependencies; excluded.

---

*Stack analysis: 2026-10-10*
