---
phase: 01-foundation-staff-sign-in
plan: 03
subsystem: infra
tags: [cloudflare-workers, hono, wrangler, queues, workers-static-assets, vitest, workerd, tanstack-query, supabase, logging, demo-safety]

# Dependency graph
requires:
  - phase: 01-02
    provides: forked `app/` SPA, pinned deps (hono, wrangler, @cloudflare/vite-plugin, vitest 5, @cloudflare/vitest-plugin), declared package.json scripts, web/worker-node Vitest projects, semantic --warning tokens
provides:
  - "One Worker `resspark` at https://resspark.zh-a16.workers.dev serving the SPA (assets, SPA fallback) and the API (`run_worker_first` for /api/*, /webhooks/*, /c/*) from a single `pnpm -C app run deploy`"
  - "`GET /api/config` -> `{ app_env, logics_write_enabled, app_name }`; 404 JSON envelope `{ error: { code: 'not_found' } }` for unknown /api/* and /webhooks/*"
  - "Allowlisted JSON logger (exactly 8 keys, `routePath` pattern, never path/body/headers) as the Worker's only log sink; platform `invocation_logs: false`"
  - "`logicsWriteGuard(env, caseId)`: server-side Logics write gate (flag exactly 'true' AND exact trimmed allowlist member)"
  - "Queues `resspark-jobs` + `resspark-jobs-dlq` on Workers Paid, `JOBS` producer + consumer bound; cron `*/15 * * * *`"
  - "`app/src/lib/api.ts` typed data boundary (`api<T>()`, `ApiError`, `isConfig`, `isOk`) and `app/src/lib/supabase.ts` fail-fast client"
  - "SANDBOX banner on `/admin/sign-in` and every `/admin/*` page, fail-safe (hidden only for proven production)"
  - "`app/scripts/smoke.mjs <url>` deploy proof; workerd Vitest project (spike a) for SELF.fetch tests"
affects: [01-04, 01-05, 01-06, 01-07, 01-08, phase-05-push-to-logics, client-portal, webhooks, jobs-queue]

# Actuals (#2632): estimateTokens scale, chars/4 over added lines of the 5 plan commits.
# 174937 counts all 43 files. 12071 is the hand-written code+docs only (excludes generated worker-configuration.d.ts and *.json, incl. RED evidence records).
actuals:
  tokens: 12071
  tokens_including_generated: 174937
  tasks: 3
  commits: 9
plan_head_before: a7c41739de9c4d1d0582c32e9e98fd66a7fed105
plan_head_after: 9ce4db60464c7e728eb7b494c2693a316bd520ca

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hono app order: requestId -> allowlisted logger -> secureHeaders -> routes; errors use the envelope { error: { code, message } } and never serialize err.message or stacks"
    - "Worker-first routing for /api/*, /webhooks/*, /c/*; everything else is static assets with SPA fallback; /c/* responses get no-store/no-referrer/nosniff/noindex headers set on c.res after next()"
    - "SPA talks to the Worker only through api(path, init, guard); every response body passes a runtime type guard"
    - "Modules that throw at load (supabase.ts) are imported lazily from public code paths"
    - "Shell offsets for global banners live in unlayered CSS keyed on data-slot, never in vendored components"
    - "TDD RED evidence for Vitest: run the vitest binary directly (not `pnpm exec`) and target the planned test with -t so tap-flat output stays strict-TAP clean"

key-files:
  created:
    - app/wrangler.jsonc
    - app/worker/src/index.ts
    - app/worker/src/routes/config.ts
    - app/worker/src/log/logger.ts
    - app/worker/src/integrations/logics/write-guard.ts
    - app/worker/vitest.config.ts
    - app/worker/test/config.test.ts
    - app/worker/test/workerd/config.test.ts
    - app/scripts/smoke.mjs
    - app/src/lib/supabase.ts
    - app/src/lib/api.ts
    - app/src/features/layout/sandbox-banner.tsx
  modified:
    - app/vite.config.ts
    - app/vitest.config.ts
    - app/tsconfig.json
    - app/worker/tsconfig.json
    - app/src/routes/admin/route.tsx
    - app/src/styles/index.css
    - docs/app/README.md

key-decisions:
  - "Logics write allowlist is an exact trimmed-string match: no numeric coercion, no prefix match, flag must be exactly 'true' (planner assumption, PLAT-05)"
  - "Logger keys actor_id (Supabase user UUID) and error_code (fixed enum) are not PII and may be logged (planner assumption, PLAT-08)"
  - "api.ts obtains the bearer via a lazy import of @/lib/supabase inside try/catch, so the deployed SPA (built without VITE_SUPABASE_*) still boots and public /api/config works"
  - "The SANDBOX banner offsets the shell via two unlayered CSS rules on data-slot, leaving vendored sidebar.tsx/header.tsx byte-identical"
  - "Workerd test project kept as a file-referenced Vitest project, excluded from `pnpm test`, and run with `pnpm -C app test:workerd`"

patterns-established:
  - "Server-side safety gate + display-only UI warning: enforcement lives in the Worker (logicsWriteGuard); the banner only informs"
  - "Deploy proof by script: smoke.mjs against the live URL after every deploy"

requirements-completed: [PLAT-01, PLAT-05, PLAT-08]

coverage:
  - id: D1
    description: "One deploy serves SPA + /api/config + Worker 404 JSON at the live URL"
    requirement: PLAT-01
    verification:
      - kind: integration
        ref: "node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev"
        status: pass
      - kind: unit
        ref: "app/worker/test/config.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Allowlisted JSON logger: exactly 8 keys, route pattern not path; invocation logs off"
    requirement: PLAT-08
    verification:
      - kind: unit
        ref: "app/worker/src/log/logger.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "logicsWriteGuard blocks unless flag is exactly 'true' and id is an exact trimmed allowlist member"
    requirement: PLAT-05
    verification:
      - kind: unit
        ref: "app/worker/src/integrations/logics/write-guard.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "api() data boundary: bearer when signed in, envelope -> ApiError, guard failure -> invalid_response"
    verification:
      - kind: unit
        ref: "app/src/lib/api.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "SANDBOX banner visible at the top of /admin/sign-in, full width, no close control, wraps without horizontal scroll below 360 px"
    requirement: PLAT-05
    verification:
      - kind: unit
        ref: "app/src/features/layout/sandbox-banner.test.tsx"
        status: pass
    human_judgment: true
    rationale: "Placement, stacking above sidebar/header, and narrow-width wrapping are visual; the plan assigns them to the end-of-phase human check"

# Metrics
duration: 52min
completed: 2026-10-11
status: complete
---

# Phase 01 Plan 03: Worker Deploy, Safety Gates, and SANDBOX Banner Summary

**One Cloudflare Worker (`resspark`) now serves the SPA and the Hono API from https://resspark.zh-a16.workers.dev. It has an allowlisted 8-key JSON logger, platform URL logging off, a server-side `logicsWriteGuard`, a typed `api()` boundary, and a fail-safe SANDBOX banner on every `/admin` page.**

## Performance

- **Duration:** 52 min wall clock, including the ENOSPC interruption and resume
- **Started:** 2026-10-11T03:14:19Z
- **Completed:** 2026-10-11T04:06:00Z
- **Tasks:** 3
- **Files modified:** 43 (12 Task 3 code/doc files, plus 31 from Tasks 1-2 including the generated `worker-configuration.d.ts`)

## Accomplishments

- **Deployed URL:** https://resspark.zh-a16.workers.dev (Worker `resspark`). The latest version ID, from the Task 3 deploy, is `48abe300-0c5a-476e-854f-1e7ca64b142b`. `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev` reports `ok /admin`, `ok /api/config`, `ok /webhooks 404 json`, and `ok /api 404 json`.
- **Queues (Workers Paid, D-06):** `resspark-jobs` (id `25f5b24c8f1f4075a2501bde688a39a6`) and `resspark-jobs-dlq` (id `c8c118c0883e44bb8b12e3f902fe1137`) were created, with the `JOBS` producer and consumer bound. The deploy output shows `Producer for resspark-jobs` and `Consumer for resspark-jobs`. No `USER ACTION REQUIRED` note is needed, because the account is on Workers Paid and the 10 ms Free-tier CPU cap does not apply.
- **spike (a): PASS.** `@cloudflare/vitest-plugin` 1.4.0 works with Vitest 5.0.3. The workerd project runs `SELF.fetch('/api/config')` and gets 200 in 4.1 s. It is kept as the file-referenced workerd project, excluded from `pnpm test`.
- **Live verification:**
  - `/c/abc` returns 200 with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and `X-Robots-Tag: noindex`.
  - `/api/config` returns `{"app_env":"sandbox","logics_write_enabled":false,"app_name":"ResSpark"}`.
  - The banner copy is in the live route chunk `/assets/route-CF1BkAev.js`, and Supabase is split into its own lazy chunk.
- **PLAT-08:** every Worker log line has exactly the keys `request_id, route, method, status, duration_ms, firm_id, actor_id, error_code`. `route` is the Hono route pattern. `observability.logs.invocation_logs: false`.
- **PLAT-05:** `logicsWriteGuard` throws `logics_write_blocked` unless `LOGICS_WRITE_ENABLED === 'true'` and the id is an exact trimmed member of `LOGICS_TEST_CASE_IDS`. The defaults (`false`, empty list) block everything. The SANDBOX banner is the display-only companion to the guard.
- **Gates:** `pnpm -C app check` (size gate, `tsc -b`, eslint, 9 files / 35 tests) and `bash app/scripts/hygiene-check.sh` are both green.

## Task Commits

1. **Task 1 (tracer): One deploy serves SPA + /api/config + Worker 404.** Commit `4bcb91f` (feat). The tracer gate re-verified the slice end-to-end with smoke.mjs green.
2. **Task 2: logicsWriteGuard, logger allowlist, Worker routing**
   - RED: `ee19c7f` (test). Evidence is in `01-03-RED-EVIDENCE.json` and was classified RED_EVIDENCE_OK.
   - GREEN: `4d20d15` (feat). This commit also covers spike (a).
3. **Task 3: SPA data boundary + SANDBOX banner + redeploy**
   - RED: `2430bb8` (test). Evidence is in `01-03-RED-EVIDENCE-task3.json` and was classified RED_EVIDENCE_OK.
   - GREEN: `9ce4db6` (feat).

**Plan metadata:** see the final `docs(01-03)` commit.

`commits: 9` is the measured `git rev-list --count a7c4173..HEAD`. Five of those are this plan's commits, listed above. The other four are `docs(02)`, `docs(03)`, `docs(05)` and `docs(04)` planning commits that concurrent planners made in the same range.

### TDD Gate Compliance

- **Task 2:**
  - RED `ee19c7f` was classified RED_EVIDENCE_OK. Its target, `write-guard.test.ts > ... > throws when the flag is false even for a listed id`, failed because the stub returned `undefined` instead of throwing.
  - GREEN `4d20d15`.
- **Task 3:**
  - RED `2430bb8` was classified RED_EVIDENCE_OK (`target_test_failed`).
    - Target: `src/lib/api.test.ts > api > attaches the bearer token and JSON content type when a session exists`.
    - Semantic assessment: the target executed and failed on the planned assertion. The promise rejected with `not_implemented` instead of resolving.
    - The full run gave `1..9`, with 8 `not ok` and 1 `ok`. The one pass is the production-absent case, which a null stub satisfies trivially. There were no load, syntax, or fixture faults.
  - GREEN `9ce4db6`: all 9 tests pass.
- **REFACTOR:** none was needed. Prettier formatting of the Task 3 files is folded into GREEN.

## Files Created/Modified

- `app/wrangler.jsonc`: Worker `resspark`, `nodejs_compat`, assets (`ASSETS` binding, SPA fallback, `run_worker_first`), demo vars, cron, queue producer/consumer + DLQ, invocation logs off
- `app/worker/src/index.ts`: Hono app (requestId, logger, secureHeaders, routes, error envelope, 404 JSON, /c/* headers, asset fallback)
- `app/worker/src/routes/config.ts`: `GET /api/config`
- `app/worker/src/log/logger.ts`: 8-key allowlisted JSON logger
- `app/worker/src/integrations/logics/write-guard.ts`: Logics write gate
- `app/worker/vitest.config.ts`, `app/worker/test/workerd/config.test.ts`: workerd project (spike a)
- `app/scripts/smoke.mjs`: deploy proof against a URL
- `app/src/lib/supabase.ts`: fail-fast Supabase client
- `app/src/lib/api.ts`: `api<T>()`, `ApiError`, `isConfig`, `isOk`
- `app/src/features/layout/sandbox-banner.tsx`: SANDBOX banner
- `app/src/routes/admin/route.tsx`: mounts the banner above `<Outlet />`
- `app/src/styles/index.css`: banner offset for the fixed sidebar and the sticky header
- Companion docs under `docs/app/...` for every file above, each with a `## Tests` section (D-23)

## Decisions Made

- **Planner assumptions recorded:**
  - The allowlist is exact match only, with no coercion and no prefix match.
  - `actor_id` is the Supabase user UUID and `error_code` is a fixed enum. Neither is PII.
- The banner's shell offset lives in unlayered CSS, so the vendored components stay byte-identical.
- The workerd project stays out of `pnpm test`, because it is slower and needs the Workers pool. Run it with `pnpm -C app test:workerd`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `assets.binding: "ASSETS"` added to wrangler.jsonc**
- **Found during:** Task 1
- **Issue:** Without the binding, `wrangler types` emits no `ASSETS` member, so the SPA fallback (`env.ASSETS.fetch`) in `index.ts` cannot compile.
- **Fix:** Added `assets.binding: "ASSETS"`.
- **Committed in:** `4bcb91f`

**2. [Rule 3 - Blocking] `cf-typegen` became `wrangler types --strict-vars=false`**
- **Found during:** Task 1
- **Issue:** Strict vars typed `LOGICS_WRITE_ENABLED` as the literal `"false"`, which broke comparisons against `'true'`.
- **Fix:** Generate the vars as `string`.
- **Committed in:** `4bcb91f`

**3. [Rule 1 - Bug] The logger emits `?? null` for absent fields**
- **Found during:** Task 2
- **Issue:** `JSON.stringify` dropped `undefined` keys, so log lines did not carry all 8 allowlisted keys.
- **Fix:** Every field now falls back to `?? null`.
- **Committed in:** `4d20d15`

**4. [Rule 1 - Bug] `/c/*` headers are set after `next()` on `c.res`, and the asset fallback is cloned**
- **Found during:** Task 1
- **Issue:** As first written, the no-store/no-referrer/nosniff/noindex headers did not land on the asset-fallback response (the previous executor recorded the fix, not the root cause; an asset `Response` has immutable headers).
- **Fix:** Clone with `new Response(res.body, res)`, then set the headers on `c.res` after `next()`.
- **Committed in:** `4bcb91f`

**5. [Rule 3 - Blocking] `@cloudflare/vitest-plugin/types` added to `app/worker/tsconfig.json`**
- **Found during:** Task 2 (spike a)
- **Issue:** `tsc -b` could not resolve the `cloudflare:test` types.
- **Committed in:** `4d20d15`

**6. [Rule 1 - Bug] `config.test.ts` narrows `res.json()`**
- **Found during:** Task 2
- **Issue:** The test read fields off the untyped `res.json()` result. It now narrows that result before asserting.
- **Committed in:** `4d20d15`

**7. [Rule 2 - Critical] Lazy `@/lib/supabase` import in `api.ts`**
- **Found during:** Task 3
- **Issue:** The deployed SPA is built without `VITE_SUPABASE_*` until Plan 06, and `supabase.ts` throws at module load. A static import would have crashed the whole SPA as soon as `SandboxBanner` mounted on `/admin`.
- **Fix:** `accessToken()` calls `await import('@/lib/supabase')` inside try/catch. With no env there is no session and no `authorization` header, so public `/api/config` still works. The `supabase.ts` acceptance strings are kept verbatim; its double-quoted throw was restored after Prettier rewrote it to single quotes.
- **Files modified:** `app/src/lib/api.ts`
- **Verification:** `api.test.ts` passes 5/5. The live bundle has Supabase in its own lazy chunk, and `/admin/sign-in` returns the SPA HTML (`<div id="root"`). A browser run was not made; the end-of-phase visual check covers it.
- **Committed in:** `9ce4db6`

**8. [Rule 3 - Blocking] ENOSPC interruption and resume**
- **Found during:** Task 3
- **Issue:** Drive C: filled up mid-Task-3, which truncated `01-03-RED-EVIDENCE-task3.json`. The user freed about 1.2 GB.
- **Fix:** A continuation executor verified `4bcb91f`, `ee19c7f` and `4d20d15`, then regenerated the RED evidence from a fresh run instead of committing the truncated file. Free space was 746 MB after the deploy.

**9. [Rule 3 - Blocking] RED evidence captured with the vitest binary and `-t`**
- **Found during:** Task 3 RED
- **Issue:**
  - `pnpm -C app exec vitest` appends non-TAP lines (`undefined`, `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`) to stdout after a non-zero exit.
  - Vitest `tap-flat` writes multi-line `actual`/`expected` strings with less indentation than the YAML block.
  - Both cause the strict TAP classifier to return `invalid_record`.
- **Fix:** Re-ran the planned target through `app/node_modules/.bin/vitest ... -t "attaches the bearer token"`, as tdd.md step 4 prescribes. The full 9-test report is preserved unedited in the record's `fullRunOutput` field.

---

**Total deviations:** 9 (3 Rule 1, 1 Rule 2, 5 Rule 3)
**Impact on plan:** All of them were needed for correctness or to finish the plan. No scope creep.

## Issues Encountered

- The SANDBOX offset is a fixed 2.25 rem. On phones narrow enough for the banner copy to wrap to two lines (about 420 px and below), the z-50 banner overlaps the top of the sticky shell header by about one text line while scrolling. The sidebar is unaffected, because it is hidden below `md`. Check this during the end-of-phase visual pass.
- Version `48abe300` was built before Prettier reformatted the Task 3 files. The difference is formatting only, so the deployed behaviour matches the commit.

## User Setup Required

None for this plan. WINDOWS #5 is still open: `app/.env` needs `VITE_SUPABASE_*` before Plan 06's sign-in.

## Next Phase Readiness

- Plans 04-08 can add Hono routes behind the existing middleware and call the Worker through `api()`.
- Phase 5 Logics writes must call `logicsWriteGuard` first.
- `/c/*` is reserved and hardened for the client portal.
- Human check at end of phase: the amber banner should be visible on the deployed `/admin/sign-in`, and at widths below 360 px it should wrap with no horizontal scroll.

## Broken-windows ledger

- WINDOWS #1 (README deployed-URL placeholder) is marked **fixed**. `docs/app/README.md:45` records https://resspark.zh-a16.workers.dev.

---
*Phase: 01-foundation-staff-sign-in*
*Completed: 2026-10-11*

## Self-Check: PASSED

All 14 key files exist; commits 4bcb91f, ee19c7f, 4d20d15, 2430bb8, 9ce4db6 are ancestors of HEAD.
