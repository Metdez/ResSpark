# External Integrations

**Analysis Date:** 2026-09-27

## APIs & External Services

**Document extraction fallback:**
- Sciforium Chat Completions API - fills document-owned financial fields only after a deterministic document parser fails in `src/document_parse.py`.
  - Endpoint: fixed `POST https://api.sciforium.com/v1/chat/completions` in `src/document_parse.py`.
  - SDK/Client: Python standard-library `urllib.request` in `src/document_parse.py`; no Sciforium or OpenAI-compatible SDK is declared.
  - Auth: `SCIFORIUM_API_KEY` is sent as a bearer token by `src/document_parse.py`.
  - Model selection: `SCIFORIUM_API_ENDPOINT` is placed in the request's `model` field by `src/document_parse.py`; despite its name, it is not used as the HTTP URL.
  - Data boundary: document text is truncated to 12,000 characters before transmission by `src/document_parse.py`; empty extracted text is not sent for OCR.
  - Failure behavior: fallback calls require both Sciforium environment variables, and upload-level parsing errors are retained while other files continue through `src/document_parse.py` and `src/case_api.py`.

**Browser-to-backend API:**
- Local ResSpark case API - receives multipart intake submissions and returns a typed screening result between `src/frontend/src/case-processing.ts` and `src/case_api.py`.
  - Client: browser `fetch` posts to relative `/api/cases` in `src/frontend/src/case-processing.ts`.
  - Development routing: Vite proxies `/api` to `http://127.0.0.1:8000` in `src/frontend/vite.config.js`.
  - Server: Python `ThreadingHTTPServer` binds to `127.0.0.1:8000` in `src/case_api.py`.
  - Request format: `answers` and `document_metadata` are JSON-string multipart fields; uploaded files repeat the `documents` field in `src/frontend/src/case-processing.ts` and `src/case_api.py`.
  - Response format: JSON `ResolutionCaseResult`, validated client-side by `src/frontend/src/case-processing.ts` and shaped server-side by `src/case_api.py`.
  - Limits: the server reads the complete request into memory and rejects declared bodies over 32 MiB in `src/case_api.py`.

## Data Storage

**Databases:**
- PostgreSQL 14+ - schema includes cases, canonical financial data, questions, standards, documents, extractions, and determination runs in `src/schemas/database_schema.sql`.
  - Connection: `DATABASE_URL` is read by `src/case_api.py` and `src/demo.py`.
  - Client: `psycopg` is imported lazily in `src/case_api.py` and `src/demo.py`; `PostgresStandardsRepository` uses the supplied DB-API connection in `src/standards_repository.py`.
  - Runtime use: the HTTP API currently reads only IRS standards through `src/standards_repository.py`; it does not insert or update the case, document, extraction, or determination tables defined in `src/schemas/database_schema.sql`.
  - Query safety: all dynamic standards lookups use positional parameters through `cursor.execute(query, parameters)` in `src/standards_repository.py`.
  - Initialization: apply `src/schemas/database_schema.sql`, then `src/schemas/lookup_standards.seed.sql`, as specified in `README.md` and `src/schemas/README.md`.

**File Storage:**
- Uploaded documents are local and ephemeral in the active API path. `src/case_api.py` writes each upload as an indexed PDF inside `tempfile.TemporaryDirectory`; the directory is removed after `src/document_parse.py` returns.
- The `documents.storage_key` column in `src/schemas/database_schema.sql` anticipates external or durable file storage, but no storage provider or write path is implemented in `src/case_api.py`.
- Synthetic PDF packets under `examples/` and reference forms under `forms/` are repository fixtures/reference inputs, not a runtime storage service; their use is described in `README.md` and `AGENTS.md`.

**Caching:**
- None detected. `src/standards_repository.py` performs a database query for each requested standards value, and `src/case_api.py` does not configure an in-memory or external cache.

## Authentication & Identity

**Auth Provider:**
- Not detected. `src/case_api.py` accepts `POST /api/cases` without session, user, API-key, or authorization checks and binds only to loopback for local use.
  - Implementation: no user identity is represented in `src/frontend/src/case-processing.ts` or checked by `src/case_api.py`.
- Sciforium service authentication is machine-to-machine bearer authentication using `SCIFORIUM_API_KEY` in `src/document_parse.py`; it is not end-user authentication.

## Monitoring & Observability

**Error Tracking:**
- None detected. No error-tracking SDK is declared in `src/frontend/package.json`, and backend code under `src/` imports no monitoring client.

**Logs:**
- `src/case_api.py` prints one startup line and otherwise inherits request logging from `BaseHTTPRequestHandler`; there is no structured logging configuration.
- Expected document parsing failures are converted into per-file error records by `src/document_parse.py` and surfaced as review notes by `src/case_api.py` rather than emitted to an external logging system.
- Database connection and lookup failures are converted into an unresolved screening response by `src/case_api.py`; exceptions are not exported to a telemetry service.

## CI/CD & Deployment

**Hosting:**
- Not detected. There is no Dockerfile, Compose file, Procfile, Vercel, Netlify, or other hosting configuration at repository root; the only server entry point is the loopback process in `src/case_api.py`.
- The frontend can be built with the Vite command in `src/frontend/package.json`, but no static-host target is configured in `src/frontend/vite.config.js`.

**CI Pipeline:**
- None detected. No `.github/`, GitLab CI, Azure Pipelines, or equivalent pipeline configuration is present; test commands are documented manually in `AGENTS.md`, `README.md`, and `src/frontend/README.md`.

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - required when `src/case_api.py` or `src/demo.py` needs PostgreSQL-backed IRS standards; missing configuration yields an unresolved result in the API and a runtime error in the demo.
- `SCIFORIUM_API_KEY` - required only when the fallback extraction route in `src/document_parse.py` is invoked.
- `SCIFORIUM_API_ENDPOINT` - required only for fallback extraction and used as the model identifier in `src/document_parse.py`.

**Secrets location:**
- Process environment is the primary source in `src/case_api.py`, `src/demo.py`, and `src/document_parse.py`.
- A root `.env` file exists, is excluded by `.gitignore`, and may be loaded by `src/document_parse.py`; its contents were not read.
- A tracked `.env.example` exists as a template; its contents were not read. Keep actual connection strings and API keys out of tracked files according to `AGENTS.md`.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/cases` is the only implemented HTTP endpoint in `src/case_api.py`; it accepts multipart case submissions from `src/frontend/src/case-processing.ts`.
- Unknown paths return 404, over-limit requests return 413, malformed multipart submissions return JSON 400, and successful submissions return JSON 200 in `src/case_api.py`.
- No third-party webhook signature verification or callback endpoint is implemented in `src/case_api.py`.

**Outgoing:**
- Synchronous `POST` calls to Sciforium's chat-completions endpoint are made by `src/document_parse.py` with a 60-second URL-open timeout.
- PostgreSQL connections are opened per database-backed case evaluation in `src/case_api.py` and for the duration of the demonstration run in `src/demo.py`; these are database calls, not webhooks.
- No email, SMS, payment, accounting, IRS e-file, or other outbound service integration is present in source under `src/`.

---

*Integration audit: 2026-09-27*
