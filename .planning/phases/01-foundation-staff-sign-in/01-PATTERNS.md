# Phase 01: Foundation & Staff Sign-In - Pattern Map

**Mapped:** 2026-10-10
**Files analyzed:** 38 new/modified files (from CONTEXT.md D-01..D-22 and RESEARCH.md "Recommended Project Structure")
**Analogs found:** 17 / 38 (the remaining 21 are a new runtime: Hono Worker, wrangler, TanStack Router, shadcn fork; RESEARCH.md Code Examples 1-12 are the pattern source for those)

Scope note: the existing codebase is a vanilla-TS Vite SPA (`src/frontend/`), a Python engine, and one SQL schema. There is no Worker, no Hono, no React, no router, no middleware layer, and no `.mjs` CLI that talks to a database. Analogs below are therefore strongest for: env/Supabase client, fetch-plus-type-guard API wrapper, Vitest config/test style, SQL migration style, Node `.mjs` scripts, companion docs, and `.gitignore`. Everything else is honestly listed under "No Analog Found".

Tracked-source gate: every analog path below was checked with `git ls-files`. Two reference files are **untracked new work, not gitignored mirrors**: `src/frontend/src/supabase/client.ts` and `docs/src/frontend/src/supabase/client.md` (`git status` shows `??`). They are the only Supabase-client and companion-doc examples in the repo, so they are used, with the caveat that the hygiene plan (D-05) should `git add` them (or the planner treats them as reference text only).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.gitignore` (modify) | config | - | `.gitignore` (root) + `src/frontend/.gitignore` | exact |
| `pnpm-workspace.yaml`, root `package.json` | config | - | `src/frontend/package.json` | role-match |
| `app/package.json`, `app/.npmrc` | config | - | `src/frontend/package.json` (engines, scripts) | role-match |
| `app/tsconfig*.json` | config | - | `src/frontend/tsconfig.json` | role-match |
| `app/vite.config.ts` | config | - | `src/frontend/vite.config.js` | role-match (shape only; plugins are new) |
| `app/vitest.config.ts`, `app/worker/vitest.config.ts` | config/test | - | `src/frontend/vitest.config.ts` + `src/test-setup.ts` | role-match |
| `app/wrangler.jsonc` | config | - | none | no analog (RESEARCH Q2) |
| `app/components.json`, `app/eslint.config.js`, `app/LICENSES.md` | config | - | none (copied from shadcn-admin) | no analog |
| `app/scripts/check-file-sizes.mjs` | utility (CLI) | file-I/O | `src/frontend/scripts/generate-counties.mjs` | exact |
| `app/scripts/db-migrate.mjs` | utility (CLI) | file-I/O + child process | `src/frontend/scripts/generate-counties.mjs` | role-match |
| `app/scripts/create-staff.mjs` | utility (CLI) | request-response (Supabase admin API) | `src/frontend/scripts/generate-counties.mjs` + `src/frontend/src/supabase/client.ts` | partial |
| `app/scripts/reconcile-questions.mjs` | utility (CLI) | file-I/O + query | `src/frontend/scripts/generate-counties.mjs` (regex over SQL) | exact |
| `app/scripts/hygiene-check.sh`, `app/scripts/smoke.mjs` | test (script) | - | `generate-counties.mjs` | role-match |
| `supabase/migrations/0002_platform_foundation.sql` | migration | - | `src/schemas/database_schema.sql` | exact |
| `app/src/lib/supabase.ts` | provider | - | `src/frontend/src/supabase/client.ts` | exact |
| `app/src/lib/api.ts` | service (API client) | request-response | `src/frontend/src/case-processing.ts` | exact |
| `app/src/lib/api.test.ts` | test | - | `src/frontend/src/case-processing.test.ts` | exact |
| `app/src/features/auth/sign-in/*` (edit shadcn form) | component | request-response | `case-processing.ts` (call + guard) | partial |
| `app/src/features/layout/sandbox-banner.tsx` (+ test) | component | request-response (`/api/config`) | none in repo (vanilla DOM only) | no analog |
| `app/src/features/client-link/*` placeholder | component | - | none | no analog |
| `app/src/routes/__root.tsx`, `admin/route.tsx`, `admin/sign-in.tsx`, `admin/_shell/route.tsx`, `admin/_shell/index.tsx`, `c/$token.tsx`, `c/index.tsx` | route | - | none (TanStack file routes; shadcn-admin source) | no analog |
| `app/src/main.tsx` | config (bootstrap) | - | `src/frontend/src/main.ts` | role-match (fail-fast root check) |
| `app/worker/src/index.ts` | controller (Hono entry) | request-response | none | no analog (RESEARCH Ex. 1) |
| `app/worker/src/env.ts` | config | - | none | no analog |
| `app/worker/src/middleware/{request-id,logger,secure-headers,staff-auth}.ts` | middleware | request-response | none | no analog (RESEARCH Ex. 3, 10) |
| `app/worker/src/auth/staff-jwt.ts` | service | request-response | none | no analog (RESEARCH Q3) |
| `app/worker/src/auth/client-link.ts` | utility (crypto) | transform | none | no analog (RESEARCH Ex. 7) |
| `app/worker/src/db/{client,events,staff,client-links}.ts` | model / data-access | CRUD | `src/frontend/src/supabase/client.ts` (client creation only) | partial |
| `app/worker/src/routes/{config,admin-session,client-link}.ts` | controller | request-response | none | no analog (RESEARCH Ex. 2, 7, 8) |
| `app/worker/src/integrations/logics/write-guard.ts` (+ test) | utility (pure) | transform | `src/frontend/src/flow.ts` + `flow.test.ts` | role-match |
| `app/worker/src/log/logger.ts` (+ test) | middleware | event-driven | `flow.ts` (pure allowlist) + `case-processing.test.ts` (spy on globals) | partial |
| `app/worker/test/{rls,auth,session,client-link}.test.ts` | test | request-response | `src/frontend/src/case-processing.test.ts` | role-match |
| `docs/app/**/*.md` (one per code file) | docs | - | `docs/src/frontend/src/supabase/client.md` | exact |
| `src/frontend/README.md` (add legacy note) | docs | - | itself | exact |

## Pattern Assignments

### `app/src/lib/supabase.ts` (provider)

**Analog:** `src/frontend/src/supabase/client.ts` (11 lines, untracked, see gate note)

**Whole file** (lines 1-11): copy verbatim, same env var names (D-07).
```typescript
/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(url, key);
```
Keep: fail-fast on missing env, one exported instance, named export. The Worker-side client (`app/worker/src/db/client.ts`) follows the same shape but reads `env.SUPABASE_URL` / `env.SUPABASE_SECRET_KEY` from Hono `c.env`, passes `{ auth: { persistSession: false, autoRefreshToken: false } }`, and is created per request (RESEARCH anti-pattern: never module scope with the secret key).

---

### `app/src/lib/api.ts` (service, request-response)

**Analog:** `src/frontend/src/case-processing.ts` (64 lines, tracked)

**Imports pattern** (lines 1-2): `import type` for model types, relative paths; the new app uses the `@/` alias from shadcn-admin instead.

**Boundary type guards** (lines 17-20):
```typescript
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCaseResult = (value: unknown): value is ResolutionCaseResult => {
  if (!isObject(value) || !isObject(value.outcome)) return false;
```
Copy `isObject` and write one `isX` guard per response shape (`isConfig`, `isOk`, `isApiError`). CONVENTIONS.md requires guards at every API boundary.

**Fetch + status check + guard** (lines 59-63):
```typescript
  const response = await fetch("/api/cases", { method: "POST", body });
  if (!response.ok) throw new Error(`Case submission failed (${response.status}).`);
  const result: unknown = await response.json();
  if (!isCaseResult(result)) throw new Error("Case submission returned an invalid result.");
  return result;
```
Keep the sequence (fetch, `!ok` throw, `unknown` json, guard, return). Add what RESEARCH Ex. 4 adds: read `supabase.auth.getSession()` and set `authorization: Bearer`, parse the `{ error: { code, message } }` envelope into an `ApiError(status, body)`.

---

### `app/src/lib/api.test.ts`, `app/worker/test/*.test.ts` (test)

**Analog:** `src/frontend/src/case-processing.test.ts` (55 lines, tracked)

**Imports + environment pragma** (lines 1-7):
```typescript
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { processCase } from "./case-processing";

describe("case processing API", () => {
  afterEach(() => vi.unstubAllGlobals());
```

**Stub `fetch`, assert call shape** (lines 26-35):
```typescript
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal("fetch", fetch);
    ...
    expect(fetch).toHaveBeenCalledWith("/api/cases", expect.objectContaining({ method: "POST" }));
```

**Failure cases, one `it` each** (lines 46-54):
```typescript
  it("rejects an unsuccessful API response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(processCase({ answers: {}, documents: [] })).rejects.toThrow("Case submission failed (503).");
  });
  it("rejects a malformed API result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ready" }) }));
    await expect(processCase({ answers: {}, documents: [] })).rejects.toThrow("invalid result");
  });
```
Apply to: `api.test.ts` (same three cases), `logger.test.ts` (`vi.spyOn(console, "log")` instead of `stubGlobal`, assert the captured line lacks the token), `write-guard.test.ts` (three cases from RESEARCH Ex. 9). Co-locate tests as `*.test.ts` next to the source (CONVENTIONS.md); `app/worker/test/` holds only the integration tests that need env/bindings.

---

### `app/worker/src/integrations/logics/write-guard.ts`, `app/worker/src/log/logger.ts` (pure utility + test)

**Analog:** `src/frontend/src/flow.ts` (53 lines) + `flow.test.ts` (105 lines), tracked

**Pure named-export functions, early return, no classes** (flow.ts lines 10-17):
```typescript
export function validateAnswer(question: QuestionDefinition, rawValue: string | boolean): string | null {
  if (question.valueType === "boolean") {
    return typeof rawValue === "boolean" ? null : "Choose an answer to continue.";
  }

  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return "Enter an answer to continue.";
  }
```

**Test imports real data, asserts exact arrays** (flow.test.ts lines 1-6, 13):
```typescript
import { describe, expect, it } from "vitest";

import { getApplicableQuestions, parseAnswer, validateAnswer } from "./flow";
import { questions } from "./questions";

describe("intake flow", () => {
  ...
    expect(questions.map((question) => question.id)).toEqual([
```
For the logger: assert `Object.keys(JSON.parse(line))` equals the exact allowlist array, the same way `flow.test.ts` asserts the exact id list.

---

### `app/scripts/*.mjs` (CLI utilities, file-I/O)

**Analog:** `src/frontend/scripts/generate-counties.mjs` (34 lines, tracked)

**Imports + path resolution relative to the script** (lines 1-8):
```javascript
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(scriptDirectory, "../../schemas/lookup_standards.seed.sql");
const outputPath = resolve(scriptDirectory, "../src/counties.generated.ts");
const sql = readFileSync(sqlPath, "utf8");
```

**Fail fast with a thrown Error, no deps, no argv parser** (line 12):
```javascript
if (start < 0 || end < 0) throw new Error("Housing standards section was not found.");
```

**Regex extraction over a SQL file** (lines 15-22) is the exact pattern `reconcile-questions.mjs` needs to pull the 28 `question_id` values out of `src/schemas/database_schema.sql` and `src/questions.py` (`/"id":\s*"([a-z0-9_]+)"/g`):
```javascript
const rowPattern = /\(\d+,\s*'((?:''|[^'])*)',\s*'((?:''|[^'])*)',\s*'[^']*',\s*1,\s*[\d.]+\)/g;
for (const match of sql.slice(start, end).matchAll(rowPattern)) {
```
Apply to: `check-file-sizes.mjs` (RESEARCH Ex. 11 already matches this style), `db-migrate.mjs` (add `spawnSync("npx", ["-y","supabase","db","query","--linked","--project-ref",REF,"-f",abs], { stdio: "inherit", cwd: <dir without .env> })` from `node:child_process`; this is the only pattern with no local precedent), `create-staff.mjs` (import `createClient` as in `supabase/client.ts`, read `SUPABASE_URL`/`SUPABASE_SECRET_KEY` from `process.env`, throw if missing, run via `npx -y dotenv-cli -e app/.dev.vars -- node app/scripts/create-staff.mjs`). Wire each into `app/package.json` `scripts` the way line 10 of `src/frontend/package.json` does: `"generate:counties": "node scripts/generate-counties.mjs"`.

---

### `supabase/migrations/0002_platform_foundation.sql` (migration)

**Analog:** `src/schemas/database_schema.sql` (302 lines, tracked)

**File header comment + explicit transaction** (lines 1-11, 302):
```sql
-- V5 simple canonical data schema (PostgreSQL 14+).
--
-- Source of truth:
--   * one case_financial_data row is the current official data for a case;
--   * NULL means unknown; an explicit 0 means known to be zero;
...
BEGIN;
...
COMMIT;
```

**Table style: UUID PK, TEXT + CHECK enums, TIMESTAMPTZ defaults, FK with ON DELETE** (lines 13-20, 257-267):
```sql
CREATE TABLE cases (
    id UUID PRIMARY KEY,
    external_reference TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'intake'
        CHECK (status IN ('intake', 'awaiting_documents', 'information_needed', 'ready', 'ready_for_review', 'blocked', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE documents (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    ...
    analysis_status TEXT NOT NULL DEFAULT 'uploaded'
        CHECK (analysis_status IN ('uploaded', 'processing', 'complete', 'needs_review', 'failed'))
);
```
Match: uppercase keywords, 4-space indent, `TEXT ... CHECK (x IN (...))` for `role` and `actor_type`, `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. Differences required by D-10/D-11: use `CREATE TABLE IF NOT EXISTS public.<name>` and `ADD COLUMN IF NOT EXISTS` (re-runnable), `gen_random_uuid()` default for new PKs (the baseline generates ids in Python).

**SQL function style** (lines 172-181):
```sql
CREATE FUNCTION canonical_state_name(input_state TEXT)
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
    SELECT COALESCE(
        (SELECT canonical_state FROM state_aliases WHERE alias = LOWER(BTRIM(input_state))),
        BTRIM(input_state)
    );
$$;
```
`log_event()` follows this layout (`LANGUAGE SQL`, one statement in `$$`) but adds `SECURITY INVOKER SET search_path = ''` and `RETURNS bigint` (RESEARCH Ex. 12), plus `REVOKE EXECUTE ... FROM public, anon, authenticated`.

**Index naming** (lines 298-300): `<table>_<column>_idx`, composite with `DESC` for time ordering:
```sql
CREATE INDEX determination_runs_case_id_idx ON determination_runs(case_id, created_at DESC);
```
Use `events_firm_id_idx ON public.events (firm_id, created_at DESC)` and `staff_profiles_firm_id_idx`.

**Seed rows** (line 31): plain `INSERT INTO ... VALUES`; add `ON CONFLICT (id) DO NOTHING` for the `firms` seed so the migration is idempotent.

**Not in the analog, must be added** (verified fact F-6): the `ENABLE ROW LEVEL SECURITY` / `REVOKE ALL ... FROM anon, authenticated` / `ALTER DEFAULT PRIVILEGES` block from RESEARCH Q4. The baseline file contains no RLS or grant statements; `rls.test.ts` is the proof it was added.

---

### `app/vitest.config.ts`, `app/worker/vitest.config.ts` (test config)

**Analog:** `src/frontend/vitest.config.ts` (7 lines) + `src/frontend/src/test-setup.ts` (29 lines), tracked

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/test-setup.ts"],
  },
});
```
Keep `defineConfig` from `vitest/config` (separate from `vite.config.ts`, as today). Extend with `test.projects` per RESEARCH Q6. The existing repo sets jsdom per file via `// @vitest-environment jsdom` pragma (case-processing.test.ts line 1) rather than globally; the new `web` project sets `environment: "jsdom"` once, so drop the pragma. `test-setup.ts` shows the house way to mock a heavy UI dependency with `vi.mock(...)` at setup time; reuse for mocking `@/lib/supabase` in `guard.test.tsx`.

---

### `app/vite.config.ts` (config)

**Analog:** `src/frontend/vite.config.js` (9 lines, tracked)
```javascript
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
```
Only the `defineConfig` shape carries over. **Do not copy the proxy**: with `@cloudflare/vite-plugin` the Worker serves `/api/*` on the same Vite origin (RESEARCH Q2). Plugin list is RESEARCH Q2's `[tanstackRouter(), react(), tailwindcss(), cloudflare()]`. Write it as `.ts` (CLAUDE.md: TypeScript front end).

---

### `app/package.json`, `app/.npmrc`, root `package.json` (config)

**Analog:** `src/frontend/package.json` (25 lines, tracked)
```json
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "generate:counties": "node scripts/generate-counties.mjs",
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run"
  },
```
Keep `private`, `type: module`, `engines`, script naming. Change `engines.node` to `>=22.12`, add `"packageManager": "pnpm@10.32.1"`, add `check` = `node scripts/check-file-sizes.mjs && tsc -b && eslint . && vitest run`, `deploy` = `vite build && wrangler deploy`, `cf-typegen` = `wrangler types`. Add `app/.npmrc` with `engine-strict=true` (F-11; the legacy project has none, so `>=18` was never enforced).

---

### `.gitignore` (modify)

**Analog:** itself + `src/frontend/.gitignore`. Verified bytes (F-9): root is four CRLF lines `venv/`, `__pycache__/`, `node_modules/`, `.env` (no trailing newline); `src/frontend/.gitignore` is `node_modules/`, `dist/`. The CONTEXT "merged `.envnode_modules/` line" is a display artifact of the missing final newline, not a real merged line. Edit: append a newline, then add `.env.*`, `!.env.example`, `dist/`, `.dev.vars*`, `.wrangler/`. Keep CRLF to match. `git rm -r --cached src/frontend/dist` is a no-op (0 tracked files); the plan should verify with `git ls-files src/frontend/dist | wc -l` and skip.

---

### `docs/app/**/*.md` (companion docs)

**Analog:** `docs/src/frontend/src/supabase/client.md` (18 lines, untracked, see gate note)
```markdown
# `src/frontend/src/supabase/client.ts`

Browser Supabase client for the Vite frontend. Nothing imports it yet.

| Lines | What it does |
|-------|--------------|
| 1 | Pulls in Vite's `import.meta.env` types. |
| 4-5 | Reads the project URL and publishable key from Vite env vars ... |
| 7-9 | Fails fast with a clear message if either variable is missing ... |

## Notes

- The publishable key is meant for browsers, but it is only safe if Row Level Security policies exist ...
```
Format per CLAUDE.md: H1 = source path in backticks, one-sentence purpose, a `Lines | What it does` table covering every line range, then `## Notes` for security/caveats. Mirror the source path under `docs/` (`app/worker/src/log/logger.ts` -> `docs/app/worker/src/log/logger.md`). `docs/app/README.md` (D-08) also records the two CLI invocations (`npx -y dotenv-cli -- npx wrangler ...` and `supabase db query --linked --project-ref zvkphuikjpwoauqdimcf` from a `.env`-free cwd).

---

### `src/frontend/README.md` (modify, legacy note)

**Analog:** itself (lines 1-5). Add one paragraph after line 5: "Legacy: frozen as of Phase 1; new work lives in `app/`. This folder and its `package-lock.json` are deleted in Phase 7." Do not touch the rest (surgical-change rule).

## Shared Patterns

### Fail-fast env validation
**Source:** `src/frontend/src/supabase/client.ts` lines 4-9; `src/frontend/src/main.ts` lines 4-8
**Apply to:** `app/src/lib/supabase.ts`, `app/scripts/create-staff.mjs`, `app/scripts/db-migrate.mjs`, `app/worker/src/db/client.ts`
```typescript
const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("The ResSpark app root is missing.");
}
```
Throw a plain `Error` naming the missing thing; never log the value.

### Type guards at every boundary
**Source:** `src/frontend/src/case-processing.ts` lines 17-47; `src/frontend/src/app.ts` lines 18-30 (`loadDraft` validates `sessionStorage` JSON the same way)
**Apply to:** `app/src/lib/api.ts` responses, `app/worker/src/routes/admin-session.ts` body (`event` enum check, RESEARCH Ex. 8), `app/worker/src/auth/client-link.ts` (length check before HMAC), cookie JSON in `getSignedCookie`.
Shape: `const isX = (value: unknown): value is X => isObject(value) && typeof value.field === "string" && ...`. No Zod in Phase 1 (RESEARCH: `@hono/standard-validator` arrives in Phase 2).

### Test style
**Source:** `src/frontend/src/case-processing.test.ts`, `src/frontend/src/flow.test.ts`
**Apply to:** every `*.test.ts` in `app/`
- `import { describe, expect, it, vi } from "vitest"` then a blank line then local imports.
- One `describe` per module, `it("<plain-English behavior>")`, happy path first, then one `it` per failure branch.
- `vi.stubGlobal` / `vi.spyOn` + `afterEach(() => vi.unstubAllGlobals())`; no test doubles beyond `vi.fn()`.
- Co-located next to source; `app/worker/test/` only for env-gated integration tests (`describe.skipIf(!url || !key)`).

### Node script conventions
**Source:** `src/frontend/scripts/generate-counties.mjs`
**Apply to:** all `app/scripts/*.mjs`
`node:` prefixed imports only, `fileURLToPath(import.meta.url)` for paths, no third-party deps, `throw new Error(...)` for preconditions, exit code via uncaught throw or `process.exit(1)` after `console.error`.

### Naming and exports
**Source:** all of `src/frontend/src/**` (`case-processing.ts`, `document-upload/requests.ts`, `resolution-results/model.ts`)
**Apply to:** every new file outside vendored `app/src/components/ui/**`
kebab-case filenames, named exports only, no default exports (exception: Vite/Vitest configs, TanStack route files, and the Worker `export default { fetch, queue, scheduled }`, which the frameworks require), no barrel `index.ts`, `import type` for types. Known shortcuts get a `shortcut: <limit>, <when to upgrade>` comment (e.g. in-memory rate-limit fallback, `ui/**` size-check exclusion).

### SQL conventions
**Source:** `src/schemas/database_schema.sql`
**Apply to:** `supabase/migrations/*.sql`
Header comment explaining the data rule, `BEGIN;`/`COMMIT;`, uppercase keywords, `TEXT CHECK (... IN (...))` enums, `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `<table>_<col>_idx` indexes, `REFERENCES ... ON DELETE CASCADE` where the child is meaningless without the parent (`staff_profiles.user_id -> auth.users`), nullable FKs elsewhere (`events.case_id`).

## No Analog Found

Planner should use the cited RESEARCH.md Code Examples (verified against official docs) rather than inventing from the legacy app.

| File | Role | Data Flow | Reason / Source to use |
|------|------|-----------|------------------------|
| `app/wrangler.jsonc` | config | - | No Cloudflare config exists. RESEARCH Q2 block (verbatim). |
| `app/worker/src/index.ts` | controller | request-response | No Hono/Worker code exists. RESEARCH Ex. 1. |
| `app/worker/src/middleware/*.ts` | middleware | request-response | Legacy app has no server middleware. RESEARCH Ex. 3 (staff-auth), Ex. 10 (logger); `hono/request-id`, `hono/secure-headers` builtins. |
| `app/worker/src/auth/staff-jwt.ts` | service | request-response | No JWT code exists. RESEARCH Q3 `jose` snippet. |
| `app/worker/src/auth/client-link.ts` | utility | transform | No Web Crypto/HMAC code exists. RESEARCH Ex. 7 + Q5. |
| `app/worker/src/routes/*.ts` | controller | request-response | Legacy `/api/cases` is Python (`src/case_api.py`), not reusable. RESEARCH Ex. 2, 7, 8. |
| `app/worker/src/db/*.ts` | data-access | CRUD | No TS data layer; only client creation pattern carries over. RESEARCH Pattern 2 (`firmId` first arg), Pattern 3 (`admin.rpc("log_event", ...)`). |
| `app/src/routes/**` | route | - | Legacy app is a hand-rolled screen state machine (`app.ts` `type Screen`), not a router. shadcn-admin `routes/` + RESEARCH Q1 guard. |
| `app/src/features/**`, `app/src/components/**`, `app/src/styles/**` | component | - | Legacy UI is vanilla DOM + Material Web; not React. Fork shadcn-admin (MIT) per D-03; RESEARCH Q1 lists exactly which files to keep/delete/edit. |
| `app/src/features/layout/sandbox-banner.tsx` | component | request-response | No React component exists. Use `useQuery` (TanStack Query, already in fork) calling `api("/api/config", {}, isConfig)`; render when `app_env !== "production"`. |
| `app/components.json`, `app/eslint.config.js`, `app/tsconfig.app.json`, `app/tsconfig.node.json`, `app/tsconfig.worker.json` | config | - | Copied from shadcn-admin; `tsconfig.worker.json` adds `types: ["./worker-configuration.d.ts"]` per `wrangler types`. |
| `app/scripts/db-migrate.mjs` (child-process part) | utility | child process | No script spawns a CLI today. RESEARCH Q4 `spawnSync` sketch; file-walk/regex half follows `generate-counties.mjs`. |
| `app/worker/test/rls.test.ts` | test (integration) | request-response | No live-service test exists (Python tests use a fake repo by design). RESEARCH Ex. 6 verbatim, gated with `describe.skipIf`. |

## Metadata

**Analog search scope:** `src/frontend/**` (tracked TS, configs, scripts, README), `docs/**`, `src/schemas/*.sql`, `src/tests/*.py` (header only, for style parity), root `.gitignore`, `.agents/skills/` (listing only; rules already summarized in RESEARCH).
**Files scanned:** 24 read in full or targeted (`counties.generated.ts` and `.env*` deliberately not read).
**Tracked-source check:** all analog paths pass `git ls-files` except `src/frontend/src/supabase/client.ts` and `docs/src/frontend/src/supabase/client.md`, which are untracked new files (not gitignored mirrors); flagged above.
**Pattern extraction date:** 2026-10-10
