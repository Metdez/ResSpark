---
last_mapped_commit: ba83e4e43838595a38647e26882014745b62d476
last_mapped_at: 2026-10-10
---
# External Integrations

**Analysis Date:** 2026-10-10

## APIs & External Services

**LLM document extraction (OpenRouter):**
- Used as a fallback when a PDF parse fails. It asks the model for the columns owned by that document type.
- Endpoint: `https://openrouter.ai/api/v1/chat/completions` (constant `_CHAT_URL` in `src/document_parse.py`, around line 105)
- Call site: `src/document_parse.py` (request built with `urllib.request.Request`, `urlopen(..., timeout=60)`, around lines 401-420)
- SDK/Client: none. Plain HTTP via Python stdlib `urllib.request`.
- Auth: env var `OPENROUTER_API_KEY` (sent as a bearer token). Model chosen with env var `OPENROUTER_MODEL`.
- Behavior: if either variable is empty, the fallback is skipped (`src/document_parse.py` around line 424; tests in `src/tests/test_document_parse.py` assert `urlopen` is not called in that case). Missing variables raise `RuntimeError` when the call is attempted.
- Data sent: extracted text from client tax documents (synthetic packets in `examples/` in development). This is third-party processing of client financial data; treat it as a data-handling decision.

**IRS Logics (Valor Tax) public API, V4:**
- Reference documentation only: `Logics_API_Documentation.docx.md` at repo root.
- Base URL in docs: `https://valortax.logiqsapi.com/publicapi/V4/`
- Auth in docs: HTTP Basic, where username = API key and password = secret token (`Authorization: Basic base64("<API Key>:<Secret Token>")`). Credentials are issued from the Logics Security section and are not stored in this repo.
- Endpoint groups documented: Appointment, Billing, Case, CaseActivity, Documents, Fax, Find, Report, Services, Task, UpdateCase, Users.
- Code usage: none found. No file under `src/` references `logiqsapi` or `valortax`. The integration is planned, not implemented.

**Cloudflare:**
- Referenced in project `CLAUDE.md` as available for `npx wrangler` and the Cloudflare API, with the token expected in `.env`.
- No Wrangler config, Worker code, or Cloudflare SDK usage in the repo.

**Plaid and Truv:**
- Listed in project `CLAUDE.md` as planned integrations with documentation links (`https://plaid.com/docs/`, `https://docs.truv.com/developers/home`).
- No code, config, or env variables for either were found.

## Data Storage

**PostgreSQL (primary, via standards lookups and case data):**
- Connection: env var `DATABASE_URL`, read in `src/case_api.py` (line ~103) and `src/demo.py` (line ~76). Missing value raises `LookupError` (API) or `RuntimeError` (demo).
- Client: `psycopg` (v3), imported lazily: `import psycopg` in `src/case_api.py` (line ~107) and `src/demo.py`.
- Repository layer: `src/standards_repository.py` defines `PostgresStandardsRepository`, which takes a caller-owned connection and runs parameterized queries through `cursor.execute(query, parameters)`.
- Schema: `src/schemas/database_schema.sql` (tables include `cases`, `question_definitions`, `case_financial_data`, `state_aliases`, `county_suffixes`, `housing_utilities_standards`, `msa_county_standards`, `state_region_standards`).
- Seed data: `src/schemas/lookup_standards.seed.sql`.
- Apply order: `database_schema.sql`, then `lookup_standards.seed.sql`, via `psql`.
- Tests do not need a database. They use a fake standards repository.

**Supabase (frontend client):**
- Client: `@supabase/supabase-js` `^2.117.3`, created in `src/frontend/src/supabase/client.ts` with `createClient(url, key)`.
- Connection: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (names listed in `src/frontend/.env.example`; values not read).
- Current usage: the client is exported as `supabase` but no `supabase.from(...)`, auth, or storage call was found in `src/frontend/src/`. Treat the Supabase project as configured but not yet wired to screens.
- Config directory `src/frontend/src/supabase/` contains only `client.ts`. No `supabase/config.toml` or migrations were found.

**File Storage:**
- Local filesystem only. Uploads arrive from the browser as request bodies and are handled in memory (`_MAX_BODY = 32 * 1024 * 1024` in `src/case_api.py`). `tempfile` is used during parsing (`src/case_api.py`).

**Caching:**
- None detected.

## Authentication & Identity

**Auth Provider:**
- No end-user authentication in the application code. The local API (`POST /api/cases` on `127.0.0.1:8000`) has no auth check.
- Supabase is the intended auth/identity provider (client is configured), but no sign-in flow was found.
- Service auth to external APIs uses bearer keys (OpenRouter) and Basic auth (Logics, documented only).

## Monitoring & Observability

**Error Tracking:**
- None detected. No Sentry, Datadog, or similar SDK in `src/frontend/package.json` or Python imports.

**Logs:**
- Python `print(..., flush=True)` for startup messages (`src/case_api.py`). No logging framework configured.

## CI/CD & Deployment

**Hosting:**
- Not defined in the repo. The API runs locally. The frontend builds to `src/frontend/dist/` and is served by Vite in development.
- Cloudflare access is granted in `CLAUDE.md`, but no deploy config is in the repo.

**CI Pipeline:**
- None detected. No `.github/workflows/`, `.gitlab-ci.yml`, or similar.

## Environment Configuration

**Required env vars (names only):**
- `DATABASE_URL` - PostgreSQL connection string for standards lookups and case data (required for database-backed runs)
- `OPENROUTER_API_KEY` - OpenRouter bearer key (optional; enables LLM fallback in document parsing)
- `OPENROUTER_MODEL` - OpenRouter model identifier (optional; required together with the key)
- `VITE_SUPABASE_URL` - Supabase project URL (required by the frontend at startup)
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase publishable (anon) key (required by the frontend at startup)
- `CLOUDFLARE_API_TOKEN` - referenced in `CLAUDE.md`, not in any code path

**Secrets location:**
- Root `.env` (git-ignored) and `src/frontend/.env` (Vite local env). Both exist. Contents were intentionally not read. `.env.example` files at the root and in `src/frontend/` list variable names with placeholder values.
- Logics credentials are to be kept in the Logics admin console and should be stored outside the repo.

## Webhooks & Callbacks

**Incoming:**
- None. The only HTTP route is the local `POST /api/cases` in `src/case_api.py`, called from the browser through the Vite `/api` proxy (`src/frontend/vite.config.js`).

**Outgoing:**
- OpenRouter chat completions, from `src/document_parse.py` only when the parse fallback runs.
- No webhooks are registered.

---

*Integration audit: 2026-10-10*
