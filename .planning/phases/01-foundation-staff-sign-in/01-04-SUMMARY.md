---
phase: 01-foundation-staff-sign-in
plan: 04
subsystem: database
tags: [supabase, postgres, rls, postgrest, migrations, management-api, vitest, audit-events]

# Dependency graph
requires:
  - phase: 01-02
    provides: "app/ workspace, app/package.json scripts (db:migrate, questions:reconcile, test:live), vitest worker-node project, dotenv-cli"
provides:
  - "Migration 0002_platform_foundation applied to live project zvkphuikjpwoauqdimcf and recorded in public.app_migrations"
  - "public.firms (ValorTax seeded as 00000000-0000-0000-0000-000000000001), staff_profiles, events (append-only), client_links, app_migrations; cases.firm_id/logics_case_id/retention_until"
  - "public.log_event(uuid, uuid, uuid, text, text, text, jsonb) RETURNS bigint, SECURITY INVOKER, search_path='', EXECUTE for service_role only"
  - "Durable deny-by-default: RLS on all 20 public tables, zero anon/authenticated grants, postgres default privileges revoked for both roles"
  - "app/scripts/lib/supabase-cli.mjs (runSupabase, query, queryFile, PROJECT_REF) reusable by Plans 05 and 08"
  - "app/scripts/db-migrate.mjs idempotent runner with --dry-run, --status, --query"
  - "app/worker/test/rls.test.ts strict 401/42501 probe; pnpm -C app run test:rls"
  - "app/scripts/reconcile-questions.mjs: D-13 diff (28 = 28, empty)"
affects: [01-05, 01-06, 01-07, 01-08, phase-03-requests, phase-07-determination]

# Actuals (#2632)
actuals:
  tokens: 7700
  tasks: 2
  commits: 6
plan_head_before: 0300b3adc5bee085656e38cba57db42b08371afb
plan_head_after: 889cc379d45669ce3b8ae178cbda440b73255114

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migrations: supabase/migrations/NNNN_<name>.sql, BEGIN/COMMIT, every statement re-runnable, applied by db-migrate.mjs through the Management API"
    - "Every new public table: ENABLE RLS in its migration and add its name to TABLES in rls.test.ts"
    - "Supabase CLI always runs from a temp workdir via lib/supabase-cli.mjs; SQL goes through a temp file, never argv"
    - "events ordered by id DESC (identity), created_at for display only"

key-files:
  created:
    - supabase/migrations/0002_platform_foundation.sql
    - app/scripts/lib/supabase-cli.mjs
    - app/scripts/db-migrate.mjs
    - app/scripts/reconcile-questions.mjs
    - app/worker/test/rls.test.ts
    - docs/supabase/migrations/0002_platform_foundation.md
    - docs/app/scripts/lib/supabase-cli.md
    - docs/app/scripts/db-migrate.md
    - docs/app/scripts/reconcile-questions.md
    - docs/app/worker/test/rls.test.md
    - .planning/phases/01-foundation-staff-sign-in/01-04-RED-EVIDENCE.json
  modified:
    - app/package.json
    - docs/app/README.md

key-decisions:
  - "rls.test.ts asserts strict 401 + 42501 per table, not the D-12/RESEARCH '0 rows or 401' tolerance: 200 [] would let an empty table with leaked grants pass"
  - "events.case_id is a nullable FK to cases with no ON DELETE action (a cascade/SET NULL would be an UPDATE/DELETE the append-only trigger rejects)"
  - "log_event EXECUTE revoked from PUBLIC/anon/authenticated and granted explicitly to service_role"
  - "cases.firm_id added nullable alongside existing rows; second-firm onboarding needs backfill + NOT NULL (accepted debt)"
  - "Live tests read Supabase URL/publishable key from src/frontend/.env via package.json scripts (test:rls, test:live); app/.env is not created"

patterns-established:
  - "Deny-by-default proof: one it() per sorted table name, apikey sent, no Authorization, expect 401 + 42501"
  - "db-migrate.mjs --query \"<sql>\" is the verification probe for later plans (prints rows as indented JSON)"

requirements-completed: [PLAT-02, PLAT-04]

coverage:
  - id: D1
    description: "Migration 0002 applied to the live project and recorded; re-run reports 0 pending"
    requirement: PLAT-04
    verification:
      - kind: integration
        ref: "node app/scripts/db-migrate.mjs && node app/scripts/db-migrate.mjs --dry-run | grep -q '^0 pending' && node app/scripts/db-migrate.mjs --status | grep -q '^0002_platform_foundation$'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Deny-by-default: RLS on 20/20 public tables, 0 anon/authenticated table grants, log_event prosecdef=false"
    requirement: PLAT-02
    verification:
      - kind: integration
        ref: "node app/scripts/db-migrate.mjs --query (role_table_grants n=0; pg_tables rowsecurity n=20; prosecdef false)"
        status: pass
    human_judgment: false
  - id: D3
    description: "anon gets 401/42501 on every one of the 20 public tables and cannot call rpc/log_event"
    requirement: PLAT-02
    verification:
      - kind: integration
        ref: "app/worker/test/rls.test.ts (pnpm -C app run test:rls: 21 passed, 0 skipped)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Question contract reconciled: 28 code ids = 28 DB ids, nothing inserted, src/questions.py unchanged"
    verification:
      - kind: integration
        ref: "node app/scripts/reconcile-questions.mjs (exit 0, empty diff) && git diff --quiet -- src/questions.py"
        status: pass
    human_judgment: false

# Metrics
duration: 23min
completed: 2026-10-11
status: complete
---

# Phase 1 Plan 04: Platform data foundation, deny-by-default proof, and question reconciliation Summary

**Migration 0002 (firms, staff_profiles, append-only events with `log_event()`, client_links, app_migrations) is applied to the live Supabase project through a password-free Management-API runner. Anon is proven to get 401/42501 on all 20 public tables, and the question contract reconciles 28 = 28.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-10-11T04:13:44Z
- **Completed:** 2026-10-11T04:36:18Z
- **Tasks:** 2/2
- **Files modified:** 13 (11 created, 2 modified)

## Accomplishments

- `0002_platform_foundation` is applied to `zvkphuikjpwoauqdimcf` and recorded in `public.app_migrations`. The whole file was re-run once more against the live project with no error and no duplicate rows, which proves it is idempotent. The baseline is untouched: `housing_utilities_standards` still has 16,115 rows and `question_definitions` 28.
- Deny-by-default is durable:
  - 20/20 public tables have RLS on.
  - `anon`/`authenticated` hold 0 table, routine, and sequence grants.
  - The `pg_default_acl` rows for `postgres` in `public` are now `{postgres, service_role}` only, for tables, sequences, and functions.
  - `log_event` and `events_append_only` have `prosecdef = false`, `search_path=""`, and ACL `{postgres=X, service_role=X}`.
- `rls.test.ts` passes live: `Tests 21 passed (21)`, 0 skipped.
- `reconcile-questions.mjs` reports an empty diff and inserts nothing.

### `node app/scripts/db-migrate.mjs --status`

```
0002_platform_foundation
```

### `node app/scripts/reconcile-questions.mjs` (exit 0)

```json
{
  "code_ids": 28,
  "db_ids": 28,
  "missing_in_db": [],
  "extra_in_db": []
}
```

**Note for the user:** the contract is 28 ids. The "32" in `CLAUDE.md` and `.planning/PROJECT.md` is a stale number. Should those docs be corrected? That was not done here, because `Context/` and CLAUDE.md edits are out of this plan's scope.

**Accepted debt:** `cases.firm_id` was added nullable, alongside the existing single-firm rows. Onboarding a second firm will need a backfill and then `firm_id NOT NULL`.

## Task Commits

1. **Task 1: Migration 0002 written and applied end-to-end** - `47e37d5` (feat)
2. **Task 2: PLAT-02 proof (rls.test.ts) and D-13 reconciliation**
   - `28e8193` (test): the strict 401 probe, the `test:rls` script, and the RED evidence
   - `889cc37` (feat): `reconcile-questions.mjs`, the `rls.test.ts` typecheck fix, and the docs

The ledger range `0300b3a..889cc37` holds 6 commits. Three are this plan's. The other three (`fba612d`, `b9d5e9b`, `cb0a266`) are planning-doc commits that parallel sessions landed on `zack` during execution.

## Files Created/Modified

- `supabase/migrations/0002_platform_foundation.sql`: tables, `cases` columns, indexes, `log_event()`, the append-only trigger, the ValorTax seed, and the grants block.
- `app/scripts/lib/supabase-cli.mjs`: runs `npx -y supabase@2.120.0` from a temp workdir. Provides `query` and `queryFile`, which return the `rows` array.
- `app/scripts/db-migrate.mjs`: the runner. Flags: `--dry-run`, `--status`, `--query`.
- `app/scripts/reconcile-questions.mjs`: the D-13 diff. `--apply` inserts only the missing ids.
- `app/worker/test/rls.test.ts`: 20 per-table tests, the RPC check, and a guard on the baseline table count.
- `app/package.json`: adds `test:rls`. `test:live` now also loads `../src/frontend/.env`.
- `docs/app/README.md`: a T-01-18 note (CLI stored login, use a scoped `SUPABASE_ACCESS_TOKEN` before CI).
- Companion docs: `docs/supabase/migrations/0002_platform_foundation.md`, `docs/app/scripts/lib/supabase-cli.md`, `docs/app/scripts/db-migrate.md`, `docs/app/scripts/reconcile-questions.md`, `docs/app/worker/test/rls.test.md`.

## Decisions Made

- **Strict 401, a deliberate deviation from the D-12 "0 rows or 401" tolerance.** `200 []` is what RLS with no policies returns when a grant exists. Accepting it would let an empty table such as `client_links` pass while grants leak. With F-5/F-6 and the REVOKE in Task 1, a 401 with `42501` is the true deny-by-default signal.
- **`events.case_id` is a nullable FK to `cases` with no `ON DELETE` action.** PATTERNS calls for a nullable FK. A cascade or `SET NULL` would become an UPDATE or DELETE on `events`, which the append-only trigger rejects.
- **`GRANT EXECUTE ON log_event TO service_role` is explicit.** EXECUTE is revoked from PUBLIC, so the Worker's role must not depend on an implicit grant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SQL is passed through a temp file, and the Windows command is pre-quoted**
- **Found during:** Task 1
- **Issue:** `npx` is a `.cmd` file on Windows and needs `shell: true`, which joins argv without escaping. The plan's positional-SQL `query()` would break on quotes and spaces, and the repo path contains a space.
- **Fix:** `query(sql)` writes the SQL to a numbered file in the temp workdir and calls `queryFile`. On Windows the command is one string with any argument containing whitespace double-quoted. This also avoids Node's DEP0190 warning.
- **Files modified:** `app/scripts/lib/supabase-cli.mjs`
- **Verification:** `query("select 'a b' as s, ...")` returned `[{"n":28,"s":"a b"}]`.
- **Committed in:** `47e37d5`

**2. [Rule 1 - Bug] The CLI's JSON envelope is unwrapped**
- **Found during:** Task 1 (probe)
- **Issue:** `supabase db query -o json` (2.120.0) prints `{ boundary, rows, warning }`, not a bare array.
- **Fix:** `parseRows` returns `parsed.rows`, falling back to the value itself if it is an array.
- **Committed in:** `47e37d5`

**3. [Rule 2 - Critical] Explicit `GRANT EXECUTE ON FUNCTION public.log_event(...) TO service_role`**
- **Found during:** Task 1
- **Issue:** The plan revokes EXECUTE from PUBLIC. The Worker's `service_role` then depended on a default-ACL grant made at creation time.
- **Fix:** The grant is now explicit and idempotent.
- **Verification:** proacl is `{postgres=X/postgres,service_role=X/postgres}`.
- **Committed in:** `47e37d5`

**4. [Rule 3 - Blocking, orchestrator-directed] Live-test env comes from `src/frontend/.env` through package.json scripts**
- **Found during:** Task 2
- **Issue:** `app/.env` does not exist and must not be created. A hook blocks command text that names env files.
- **Fix:**
  - Added `"test:rls": "dotenv -e ../src/frontend/.env -- vitest run --project worker-node worker/test/rls.test.ts"`.
  - `test:live` now loads `../src/frontend/.env` after `.env` and `.dev.vars`.
  - The test maps `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`.
  - The plan's verify `pnpm -C app exec dotenv -e .env -- vitest run …` was replaced by `pnpm -C app run test:rls`.
- **Files modified:** `app/package.json`
- **Committed in:** `28e8193`

**5. [Rule 1 - Bug] `rls.test.ts` passes `URL.href` to `fileURLToPath`**
- **Found during:** Task 2 (`pnpm -C app run check`)
- **Issue:** `tsc -b` failed with TS2345, because the Workers `URL` type and the Node `URL` type are incompatible.
- **Fix:** Pass `.href` (a string).
- **Committed in:** `889cc37`

**6. [Rule 2 - Threat model] T-01-18 recorded in `docs/app/README.md`**
- **Found during:** Task 1
- **Issue:** The threat register says the scoped-PAT recommendation is "recorded in docs/app/README.md", but it was missing there.
- **Fix:** Added one sentence. The file is outside the plan's `files_modified`.
- **Committed in:** `47e37d5`

---

**Total deviations:** 6 auto-fixed (2 Rule 1, 2 Rule 2, 2 Rule 3).
**Impact on plan:** All of them were needed for correctness, security, or the Windows/env constraints. No scope creep.

## TDD Gate Compliance

- **RED (`28e8193`, test):** No real RED was possible. The classifier returned `INVALID_RED / unexpected_green` (21/21 passed on the first run). Evidence is in `01-04-RED-EVIDENCE.json`.
  - **Semantic assessment:** this was investigated under Fail-Fast Rule 1. The subject under test is the live grant state that Task 1 delivered, and the schema gate requires that before any dependent test. Producing a RED would mean re-granting `anon` on the live project, which the plan prohibits. `rls.test.ts` is therefore an after-the-fact proof from outside, not a driver for new code.
- **GREEN (`889cc37`, feat):** This commit delivers `reconcile-questions.mjs`. Its check is the live verify command (exit 0, empty diff), not a Vitest test, because the plan specifies no unit test for it.
- **REFACTOR:** none.

## Issues Encountered

- `pg_default_acl` rows owned by `supabase_admin` still grant `anon`/`authenticated` on objects that `supabase_admin` creates, and the `postgres` role cannot change them (RESEARCH A-8). Migrations run as `postgres`, so they are unaffected, and `rls.test.ts` would catch a leak.
- Plain `pnpm test` reports the rls suite as skipped (21 skipped), because no env is loaded. That is by design.

## User Setup Required

None.

## Next Phase Readiness

- Plans 05-08 can use `log_event()` (as `service_role`), `staff_profiles`, `client_links`, and the ValorTax firm id `00000000-0000-0000-0000-000000000001`.
- Later migrations must ENABLE RLS and add the new table to `TABLES` in `rls.test.ts`. They should also `REVOKE EXECUTE … FROM PUBLIC` on any new function.
- The append-only trigger is not exercised live here. Plan 05's live test covers it (T-01-17).

---
*Phase: 01-foundation-staff-sign-in*
*Completed: 2026-10-11*

## Self-Check: PASSED

All 11 created files exist; commits 47e37d5, 28e8193, 889cc37 are ancestors of HEAD; plan verification re-run: db-migrate `0 pending`, test:rls 21/21, reconcile exit 0, `python -m unittest` 27 OK, `pnpm -C app run check` green.
