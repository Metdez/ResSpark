---
phase: 04-connect-payroll-bank
plan: 02
subsystem: api
tags: [cloudflare-cron, cloudflare-queues, supabase, plaid, truv, wrangler, secrets]

requires:
  - phase: 04-connect-payroll-bank
    provides: "04-01: reconcileConnection, Job union and queue consumer, connection_set_status, webhook_events ledger, PROVIDER_CAPABILITIES, targetMonths, fixtures/connections.ts"
  - phase: 01-foundation-staff-sign-in
    provides: "JOBS queue + DLQ, cron placeholder, allowlisted logger, provision-secrets.mjs, smoke.mjs"
provides:
  - "scheduled(): 15-minute reconcileTick (stuck webhook re-enqueue, stale-connection reconcile jobs, link_expired) and 03:00 dailyJobs (remove_item dispatch)"
  - "db/connections-ops.ts: cron queries + ConnectionSummary read model (month grid, accounts, transactions state, employers), firm-scoped lookups, 3|6-month transactions"
  - "GET /api/admin/requests/:id/connections, POST /api/admin/connections/:id/refresh, GET /api/admin/connections/:id/transactions"
  - "wrangler.jsonc: max_retries 5 + retry_delay 60, DLQ consumer, two crons, four Phase 4 vars, TOKEN_ENC_KEY_1 required"
  - "pnpm -C app secrets:provider plaid|truv (muted prompt, stdin to wrangler secret put)"
affects: [04-03, 04-04, 04-05, 04-06, 04-07, 05-logics-push]

actuals:
  tokens: 24700
  tasks: 3
  commits: 35
plan_head_before: 43c28ac4f796420c9a6b55484735bb618a6e40ba
plan_head_after: 1f1d95c0ad83dd6900e1d60c63a9d0011ea305c9

tech-stack:
  added: []
  patterns:
    - "Cron enqueues ids only; healing goes through the same consumer and reconcileConnection the webhook path uses"
    - "Each cron step isolated in try/catch with a fixed error_code log line; counts go to one cron.tick / cron.daily event per run"
    - "Staff read model built from an explicit field list (no row spread), pure projectSummary unit-tested, queries proven live"
    - "Shared-file commit of only own hunks via git hash-object + update-index --cacheinfo when a foreign hunk would import an uncommitted file"

key-files:
  created:
    - app/worker/src/cron.ts
    - app/worker/src/cron.test.ts
    - app/worker/src/db/connections-ops.ts
    - app/worker/src/db/connections-ops.test.ts
    - app/worker/src/routes/admin-connections.ts
    - app/worker/src/routes/admin-connections.test.ts
    - app/worker/test/connections-ops-live.test.ts
    - docs/app/worker/src/cron.md
    - docs/app/worker/src/cron.test.md
    - docs/app/worker/src/db/connections-ops.md
    - docs/app/worker/src/db/connections-ops.test.md
    - docs/app/worker/src/routes/admin-connections.md
    - docs/app/worker/src/routes/admin-connections.test.md
    - docs/app/worker/test/connections-ops-live.test.md
  modified:
    - app/worker/src/index.ts
    - app/wrangler.jsonc
    - app/worker-configuration.d.ts
    - app/worker/src/provider-env.d.ts
    - app/package.json
    - app/.dev.vars.example
    - app/scripts/provision-secrets.mjs
    - app/scripts/smoke.mjs
    - docs/app/README.md
    - docs/app/wrangler.md
    - docs/app/scripts/provision-secrets.md
    - docs/app/scripts/smoke.md
    - docs/app/worker/src/index.md
    - docs/app/worker/src/provider-env.d.md

key-decisions:
  - "Staleness = latest of last_webhook_at / last_polled_at older than 10 min (two ANDed .or() filters), plus created_at older than the cutoff so a brand-new connection is not polled in its first 10 minutes"
  - "Cron counts are recorded as a firm-level cron.tick / cron.daily event (the logger allowlist has no count fields)"
  - "firmOwnsRequest (a one-column firm-scoped read) replaces the plan's getFirmRequest: db/review.ts does not exist in this tree and the full request bundle is unnecessary for a 404 check"
  - "Employer documents are matched by payroll storage group ending in -<employer_id> (Plan 04-03's <slug>-<employer_id> naming), not by filename prefix, so two employers with the same company name never share counts"
  - "admin-connections.ts scopes staffAuth to its own paths instead of '*', so it never re-runs auth for sibling /api/admin routes"
  - "listConnectionTransactions returns null for a foreign connection (uniform 404) and converts NUMERIC amount strings to numbers"
  - "PLAID_ENV removed from provider-env.d.ts: cf-typegen now emits it as a required var (04-01 hand-off note)"

patterns-established:
  - "Live read-model suites assert only on their own fixture ids, because other suites share the test firm"

# WEBH-02, PAY-04, BANK-03, BANK-06 are advanced here but also declared by unfinished 04-03..04-07,
# so none is marked complete yet (BANK-06: dispatch half only; 04-04 executes the removal).
requirements-completed: []

coverage:
  - id: D1
    description: "scheduled() branches on the 03:00 trigger; reconcileTick re-enqueues stuck webhooks before stale reconciles in one batch, chunks of 100, link_expired via the status RPC, step isolation; dailyJobs remove_item dispatch and no-op"
    requirement: WEBH-02
    verification:
      - kind: unit
        ref: "app/worker/src/cron.test.ts (11 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cron selections against the live project: stale (incl. webhook-beats-old-poll, 14-day cap, terminal excluded), pending-link expiry (secret absence), removal candidates (remove_after == now due, oldest first, Truv / removed / no-secret / future excluded)"
    requirement: BANK-06
    verification:
      - kind: integration
        ref: "app/worker/test/connections-ops-live.test.ts cron block (3 passed, live)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Staff routes: list (firm 404, 400, 401), Refresh (event before inline staff reconcile, 404 with no reconcile, 502/503/409 mapping with vendor code only), transactions (3|6, default 6, 400, 404)"
    requirement: WEBH-02
    verification:
      - kind: unit
        ref: "app/worker/src/routes/admin-connections.test.ts (13 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "ConnectionSummary projection: 6-month grid newest first with missing fill, account order, update status mapping, capabilities, no secret/vendor-id leak, error trimming, employer counts"
    requirement: BANK-03
    verification:
      - kind: unit
        ref: "app/worker/src/db/connections-ops.test.ts (11 passed)"
        status: pass
      - kind: integration
        ref: "app/worker/test/connections-ops-live.test.ts read-model block (3 passed, live): newest-first, grid, transactions date DESC + plaid id tie-break, 3-month window, firm scope"
        status: pass
    human_judgment: false
  - id: D5
    description: "Deployed with five required secrets, two crons, both consumers; smoke proves webhook 401/404 and admin connections 401 on the public URL"
    requirement: WEBH-02
    verification:
      - kind: integration
        ref: "pnpm -C app run deploy (version 3b407e92-1749-4d9e-94cf-7ccf139c8c96) + node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev (13 ok, 0 FAIL)"
        status: pass
    human_judgment: false

duration: 3h19m wall clock (09:41Z to 13:00Z, including two session restarts and a 10-minute shared-file wait)
completed: 2026-10-11
status: complete
---

# Phase 4 Plan 02: Reconciler, staff connection routes and Worker config Summary

**A 15-minute `scheduled()` reconciler and a 03:00 Item-removal dispatch built on the same queue jobs and `reconcileConnection` the webhook path uses; firm-scoped staff routes to list connections (6-month statement grid, employer counts, transaction state), Refresh inline, and read 3- or 6-month transactions; Worker redeployed with `max_retries 5`, a DLQ consumer, two crons, four vars, and `TOKEN_ENC_KEY_1`, while vendor keys stay optional and are entered at a muted prompt.**

## Performance

- **Duration:** 3h19m wall clock. Active work was much shorter: the time includes two session restarts and a 10-minute wait on a shared file.
- **Tasks:** 3 of 3
- **Commits:** 5 of this plan's (2 RED test commits, 3 feature commits). `commits: 35` is the measured `git rev-list --count` over the window; four other executors committed on `zack` during it.
- **Deploy:** once, after `pnpm -C app run check` passed on the whole tree (74 files and 1018 tests passed, 137 skipped, 0 lint errors). Version `3b407e92-1749-4d9e-94cf-7ccf139c8c96` at https://resspark.zh-a16.workers.dev.

## Recorded facts the plan asked for

- **`max_retries: 0` on the DLQ consumer:** wrangler accepted it. The deploy printed `Consumer for resspark-jobs-dlq` and no warning.
- **`secrets.required` after deploy:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY`, `INTEGRATION_ENC_KEY`, `TOKEN_ENC_KEY_1`. No vendor keys are listed.
- **`TOKEN_ENC_KEY_1`:** newly generated (`set TOKEN_ENC_KEY_1`). The Worker had no such key before. `wrangler secret list` now shows the five names.
- **Smoke output (deployed):**
  ```
  ok /admin
  ok /api/config
  ok /webhooks 404 json
  ok /api 404 json
  ok /c/ 404 html
  ok /c/ headers
  ok /c/ spa
  ok /api/c 401 no_session
  ok /api/c start 401
  ok webhooks truv 401
  ok webhooks unknown 404
  ok admin connections 401
  ok lookup 401 without token
  ```
- **Deployed cron triggers (from the wrangler deploy output):** `schedule: */15 * * * *` and `schedule: 0 3 * * *`. The output also listed `Producer for resspark-jobs`, `Consumer for resspark-jobs`, and `Consumer for resspark-jobs-dlq`. `wrangler queues info` does not print `max_retries`; the value comes from the deployed config.

## Task Commits

1. **Task 1 (tracer): cron reconciler and daily dispatch.** `66d873b` (test, RED), `94beece` (feat, GREEN; includes the cron half of `connections-ops.ts`, its live test, and the `index.ts` `scheduled` wiring)
2. **Task 2: staff read model and routes.** `76111a7` (test, RED), `d91560d` (feat, GREEN)
3. **Task 3: Worker config, provisioning, deploy, smoke, README.** `039b4ce`

## TDD Gate Compliance

- Task 1: RED `66d873b` failed because `./cron` did not exist ("no tests" collection failure). GREEN `94beece` passed 11 tests.
- Task 2: RED `76111a7` failed 20 tests (missing `projectSummary` / `firmOwnsRequest` / route). GREEN `d91560d` passed 13 route tests and 11 projection tests.
- Tracer gate (Task 1, auto mode): `<verify>` was re-run after GREEN (`cron.test.ts` passed, `index.ts` imports `scheduled` from `./cron`) before Task 2 started.

## Decisions Made

See `key-decisions` in the frontmatter. The two that change contracts:

- `firmOwnsRequest(env, firmId, requestId)` is exported from `connections-ops.ts`. The route uses it instead of `getFirmRequest` from `db/review.ts`, which does not exist in this tree.
- `listConnectionTransactions` returns `{ rows, total } | null`. `null` means the connection is not the firm's. It also takes an optional `now` argument for tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `getFirmRequest` / `db/review.ts` missing**
- **Found during:** Task 2
- **Issue:** The plan referenced `getFirmRequest(env, firmId, requestId)` from `app/worker/src/db/review.ts`. Phase 3 (03-03) put its review reads elsewhere, and that module is not in the tree.
- **Fix:** Added `firmOwnsRequest` to `connections-ops.ts`. It is a single firm-scoped `select id` with the same uniform-404 semantics.
- **Commit:** `d91560d`

**2. [Rule 1 - Bug] Staleness must not use `coalesce`**
- **Found during:** Task 1 (live test)
- **Issue:** The plan's `coalesce(last_webhook_at, last_polled_at, created_at) < cutoff` treats a connection polled 20 minutes ago as stale even when a webhook arrived 2 minutes ago, because `coalesce` takes the first non-null value, not the latest.
- **Fix:** The query requires both `last_webhook_at` and `last_polled_at` to be null or older than the cutoff, and `created_at` to be older than the cutoff. That means the latest activity must be older than the cutoff. Proven live with the `freshWebhook` fixture.
- **Commit:** `94beece`

**3. [Rule 2 - Missing critical] Read-model leak protection and amount typing**
- **Found during:** Task 2
- **Fix:**
  - `projectSummary` drops `link_ref`, `return_nonce`, `sync_cursor`, `external_id`, and raw `data`, and trims `error` to `code` plus a string `message`. A unit test asserts none of these values appear in the serialised summary.
  - Transaction `amount` (Postgres NUMERIC, which arrives as a string) is converted to a number.
  - Refresh also maps `NonRetryableError('connection_not_found')` to 404 instead of 500, covering a connection deleted mid-request.
- **Commit:** `d91560d`

**4. [Rule 3 - Blocking] `PLAID_ENV` declared twice**
- **Found during:** Task 3
- **Issue:** `cf-typegen` now emits `PLAID_ENV: string` as a var, which conflicts with the optional member in `provider-env.d.ts`. 04-01 flagged this in its hand-off.
- **Fix:** Removed the member and updated the doc.
- **Commit:** `039b4ce`

**5. [Rule 2 - Additive] Extra tests and docs**
- **Fix:**
  - Added `connections-ops-live.test.ts` (6 live tests), so both the cron queries and the read model are proven against the real schema, not only mocks.
  - Added companion docs for every new test file.
  - Added a `secrets:provider` line to the README Commands list.
- **Commits:** `94beece`, `d91560d`, `039b4ce`

**Total deviations:** 5 auto-fixed (1 bug, 2 blocking, 2 missing-critical or additive). There is one contract change: `listConnectionTransactions` can return `null`.

## Shared-file notes

- **`app/worker/src/index.ts`:**
  - 05-01's uncommitted `adminLogicsPushRoute` import and mount were still in the working tree after a 10-minute wait. Committing the whole file would have produced a commit importing an untracked file (`routes/admin-logics-push.ts`).
  - So `d91560d` staged only this plan's two lines. The staged blob was HEAD plus the two lines, written with `git hash-object` and `git update-index --cacheinfo`.
  - The 05-01 hunk is untouched in the working tree for 05-01 to commit.
- **`app/worker/src/jobs/index.ts`:** all of its pending hunks are 05-01's. This plan did not edit it.
- **`app/scripts/smoke.mjs`:** 03-03's review-check hunk was committed by 03-03 before `039b4ce`, so that commit holds only this plan's checks.
- **Queue retries and 05-01:** `max_retries` dropped from 8 to 5, as D-03 requires. 05-01's `logics_push` handler only retries a refused claim (30 s delay), and its DLQ branch leaves the push row `queued` for its sweeper, so a push waiting on a sibling now dead-letters after 5 retries instead of 8. This does not affect correctness, but 05-01 should know.
- **Deploy scope:** the deploy shipped the shared working tree, which includes other executors' uncommitted code, after `pnpm -C app run check` passed on it. The first deploy attempt failed with a transient Windows `EPERM` on `app/dist/client/assets`. The single retry 20 s later succeeded.

## Issues Encountered

- Two Claude Code session restarts mid-plan. No work was lost: Tasks 1 and 2 RED were already committed, and Task 2 GREEN was on disk.
- `pnpm -C app exec tsc -b` showed errors only in 03-02/03-04's in-progress `src/features/dashboard` and `src/features/review` files during Task 2. By deploy time the full check was green.

## Known Stubs

None added. Two pre-existing stubs from 04-01 still apply, both owned by Plan 04-04:

- The `bank` branch of `reconcileConnection` throws `bank_not_available`. Refresh maps it to 503 `provider_not_available`.
- `remove_item` throws `job_not_available`. The daily step enqueues these jobs; the consumer acks them and records `job.failed` until 04-04 wires removal.

## Threat Flags

None. The new surfaces (staff routes, cron, provisioning prompt) are covered by T-04-07 to T-04-11 in the plan's threat model.

## User Setup Required

Yes, to turn on live connections. See `docs/app/README.md` § USER ACTION REQUIRED (Phase 4):

1. Run `pnpm -C app secrets:provider plaid` and `pnpm -C app secrets:provider truv` with Sandbox keys.
2. In the Plaid Dashboard, add the redirect URI `/c/return` and the Link customization with the tax-preparation wording.
3. In the Truv Dashboard, register the webhook `/api/webhooks/truv`, set order expiry to at least 14 days, and optionally create a template.
4. Use the Sandbox logins listed there.

Until then the Worker serves the manual-upload fallback.

## Next Phase Readiness

- Plans 04-03 and 04-04 can rely on cron healing every 15 minutes, staff Refresh, and the `ConnectionSummary` contract. The UI plans (04-05 to 04-07) read `GET /requests/:id/connections` and `GET /connections/:id/transactions`.
- Plan 04-03 must keep the `<slug>-<employer_id>` storage group naming, because employer counts depend on it.
- Plan 04-04 should write `transactions_update_status` into `connections.data`; raw Plaid values are accepted. It must also set `remove_after` when a connection reaches `connected`.

## Self-Check: PASSED

- All 14 created files and 14 modified files exist on disk.
- Commits `66d873b`, `94beece`, `76111a7`, `d91560d`, and `039b4ce` are ancestors of HEAD.
- Task 1 verify passed: `cron.test.ts` 11 passed, and `index.ts` imports `scheduled` from `./cron`.
- Task 2 verify passed: `admin-connections.test.ts` 13 passed, `admin-connections` is mounted, and `check-file-sizes` is clean. `connections-ops.ts` is 335 lines and `admin-connections.ts` is 73.
- Task 3 verify passed: all greps match and the smoke run printed 13 `ok` lines with no `FAIL`.
