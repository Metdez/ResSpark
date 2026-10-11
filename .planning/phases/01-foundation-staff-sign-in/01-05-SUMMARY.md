---
phase: 01-foundation-staff-sign-in
plan: 05
subsystem: auth
tags: [supabase, cloudflare-workers, wrangler-secrets, supabase-auth, audit-events, vitest]

# Dependency graph
requires:
  - phase: 01-03
    provides: "Worker resspark deployed, wrangler.jsonc, smoke.mjs, worker-node Vitest project"
  - phase: 01-04
    provides: "migration 0002 (firms, staff_profiles, events + log_event(), append-only trigger), lib/supabase-cli.mjs, db-migrate.mjs --query, test:live"
provides:
  - "Worker secrets SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY on resspark (names verified) and in git-ignored app/.dev.vars"
  - "wrangler.jsonc secrets.required + regenerated Env with the three string members"
  - "app/worker/src/db/: createAdminClient (per request, fail-fast), logEvent (rpc log_event), getStaffProfile"
  - "Two staff accounts with app_metadata {firm_id, role} and staff_profiles rows"
  - "Public sign-up disabled on the live project (supabase/config.toml pushed), proven by a live test"
  - "hygiene-check.sh bundle gate: no sb_secret_ in app/dist/client"
affects: [01-06, 01-07, 01-08, phase-02, phase-03, phase-04]

# Actuals (#2632)
actuals:
  tokens: 12200
  tasks: 3
  commits: 7
plan_head_before: 904a35b63ea380e6714d9925207e5edd249f3ec1
plan_head_after: fb71f113ab46646a7ef2adba5d3a8113ab14f0f2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Secrets reach wrangler only on stdin (spawnSync input), and reach disk only in app/.dev.vars via lib/dev-vars.mjs (append-missing, never overwrite)"
    - "All Worker DB access goes through app/worker/src/db/*, which builds a per-request admin client and scopes every query in code"
    - "DB helpers throw fixed error codes (log_event_failed, staff_lookup_failed) and never pass Postgres text on"
    - "Supabase project config lives in tracked supabase/config.toml and is pushed from the CLI temp workdir"

key-files:
  created:
    - app/scripts/provision-secrets.mjs
    - app/scripts/create-staff.mjs
    - app/scripts/supabase-config-push.mjs
    - app/scripts/lib/dev-vars.mjs
    - app/.dev.vars.example
    - app/worker/src/db/client.ts
    - app/worker/src/db/client.test.ts
    - app/worker/src/db/events.ts
    - app/worker/src/db/staff.ts
    - app/worker/test/events.test.ts
    - app/worker/test/signup-disabled.test.ts
    - supabase/config.toml
    - docs/app/scripts/provision-secrets.md
    - docs/app/scripts/create-staff.md
    - docs/app/scripts/supabase-config-push.md
    - docs/app/scripts/lib/dev-vars.md
    - docs/app/worker/src/db/client.md
    - docs/app/worker/src/db/events.md
    - docs/app/worker/src/db/staff.md
    - docs/app/worker/test/events.test.md
    - docs/app/worker/test/signup-disabled.test.md
    - docs/supabase/config.md
    - .planning/phases/01-foundation-staff-sign-in/01-05-RED-EVIDENCE.json
    - .planning/phases/01-foundation-staff-sign-in/01-05-RED-EVIDENCE-task3.json
  modified:
    - app/wrangler.jsonc
    - app/worker-configuration.d.ts
    - app/scripts/hygiene-check.sh
    - app/scripts/lib/supabase-cli.mjs
    - docs/app/wrangler.md
    - docs/app/scripts/hygiene-check.md
    - docs/app/scripts/lib/supabase-cli.md

key-decisions:
  - "provision-secrets.mjs reads the sb_secret_ key with `supabase projects api-keys --reveal` and rejects anything not matching ^sb_secret_[A-Za-z0-9_-]+$, so a masked value can never be provisioned"
  - "CLIENT_LINK_HMAC_KEY was newly generated on the first run; re-runs keep it (verified: second run printed `kept CLIENT_LINK_HMAC_KEY`, `wrote app/.dev.vars (0 keys)`)"
  - "create-staff.mjs re-applies app_metadata with updateUserById when the user already exists, so re-runs keep claims in line with --role"
  - "A shared lib/dev-vars.mjs (append-missing, mode 0600 on create) is the only writer of app/.dev.vars for both scripts"

patterns-established:
  - "Live suites gate on env with describe.skipIf and run through pnpm -C app run test:live (env loaded by dotenv in package.json, never named in shell commands)"
  - "Test events carry actor_type 'system' + action 'test.ping' so they are filterable in the append-only table"

requirements-completed: [PLAT-03, PLAT-04, PLAT-07]

coverage:
  - id: D1
    description: "Three Worker secrets set on resspark over stdin; names only listed; local copies in git-ignored app/.dev.vars; HMAC key kept on re-run"
    requirement: PLAT-03
    verification:
      - kind: integration
        ref: "pnpm -C app wrangler secret list (CLIENT_LINK_HMAC_KEY, SUPABASE_SECRET_KEY, SUPABASE_URL); pnpm -C app secrets:provision re-run -> kept CLIENT_LINK_HMAC_KEY, 0 keys written"
        status: pass
    human_judgment: false
  - id: D2
    description: "createAdminClient fails fast on empty/absent secrets and creates a client without network I/O"
    requirement: PLAT-03
    verification:
      - kind: unit
        ref: "app/worker/src/db/client.test.ts (4 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Client bundle contains no sb_secret_ (hygiene-check.sh gate (h))"
    requirement: PLAT-03
    verification:
      - kind: other
        ref: "pnpm -C app build && bash app/scripts/hygiene-check.sh -> hygiene ok"
        status: pass
    human_judgment: false
  - id: D4
    description: "Deploy refuses missing secrets (secrets.required) and redeploys green"
    requirement: PLAT-03
    verification: []
    human_judgment: true
    rationale: "`pnpm -C app run deploy` was blocked by the auto-mode safety classifier; the user must run it and the smoke check (USER ACTION below)"
  - id: D5
    description: "Two staff users with app_metadata firm_id/role and staff_profiles rows; nothing in user_metadata"
    requirement: PLAT-07
    verification:
      - kind: integration
        ref: "db-migrate.mjs --query: staff_profiles count 2 (admin Zack, staff Andrew (case manager)); auth.users app_meta firm_id n=2; user_meta firm_id n=0"
        status: pass
    human_judgment: false
  - id: D6
    description: "Public sign-up disabled; seeded staff can still sign in"
    requirement: PLAT-07
    verification:
      - kind: integration
        ref: "app/worker/test/signup-disabled.test.ts (2 passed, 0 skipped via pnpm -C app run test:live)"
        status: pass
    human_judgment: false
  - id: D7
    description: "logEvent/getStaffProfile: distinct increasing ids, {} payload default, append-only UPDATE/DELETE, log_event_failed, profile hit and null miss"
    requirement: PLAT-04
    verification:
      - kind: integration
        ref: "app/worker/test/events.test.ts (8 passed, 0 skipped via pnpm -C app run test:live; 34/34 across the live suites)"
        status: pass
    human_judgment: false

# Metrics
duration: 27min
completed: 2026-10-11
status: complete
---

# Phase 1 Plan 05: Worker secrets, db/ module, staff accounts, sign-up disabled Summary

**The three Worker secrets are on `resspark`, piped over stdin and never printed. `createAdminClient` / `logEvent` / `getStaffProfile` form the single `db/` module. Two staff accounts carry `app_metadata` claims, and public sign-up is off on the live project. All of it is proven by live tests. One step is open: the redeploy, which the auto-mode classifier blocked (see USER ACTION).**

## Performance

- **Duration:** 27 min
- **Started:** 2026-10-11T04:52:05Z
- **Completed:** 2026-10-11T05:19:04Z
- **Tasks:** 3/3
- **Files modified:** 31 (24 created, 7 modified)

## Accomplishments

- **Secrets set (names only):** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY` on Worker `resspark`. `CLIENT_LINK_HMAC_KEY` was **newly generated** on the first run and **kept** on the re-run. `app/.dev.vars` holds `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `STAFF_PASSWORD__zack_resspark_test`, `DEMO_STAFF_EMAIL`, `DEMO_STAFF_PASSWORD`, and `STAFF_PASSWORD__andrew_resspark_test`. The local HMAC key equals production's because the first run generated it.
- `wrangler.jsonc` declares `secrets.required`, and `Env` now has the three string members.
- **Staff seeded:** `zack@resspark.test` (admin, "Zack") and `andrew@resspark.test` (staff, "Andrew (case manager)").
- **USER ACTION:** read the demo passwords from `app/.dev.vars`. They are never committed.
- **`config push` outcome:** `auth.enable_signup [update] local: false remote: true` → `"1 property pushed to zvkphuikjpwoauqdimcf."` The other 10 remote properties were left unchanged.
- Live suites (`pnpm -C app run test:live`): 34/34 passed. That is config 3, rls 21, signup-disabled 2, and events 8.
- `pnpm -C app run check` is green (137 passed, 31 env-gated skips). `pnpm -C app build && bash app/scripts/hygiene-check.sh` gives `hygiene ok`.
- The current deployment is still smoke-green (`node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev`: 4/4 ok).

## Task Commits

1. **Task 1: Secrets → secrets.required → admin client → two staff users** (tracer, TDD)
   - `dcd6df3` (test): RED for `createAdminClient`, plus `secrets.required` and the regenerated `Env`
   - `53209dd` (feat): `provision-secrets.mjs`, `create-staff.mjs`, `lib/dev-vars.mjs`, `client.ts`, the hygiene bundle gate, and docs
2. **Task 2: Disable public sign-up and prove it live**: `febcf45` (feat)
3. **Task 3: logEvent and getStaffProfile with the live events test** (TDD)
   - `e8690c8` (test): RED live suite against stubs
   - `fb71f11` (feat): implementation and docs

The ledger range `904a35b..fb71f11` holds 7 commits. Five are this plan's. The other two (`5469266`, `0ee670d`) are orchestrator planning-doc commits that landed on `zack` during execution.

## Files Created/Modified

- `app/scripts/provision-secrets.mjs`: secrets over stdin; keeps an existing HMAC key; appends missing keys to `.dev.vars`.
- `app/scripts/create-staff.mjs`: `auth.admin.createUser` with `app_metadata`, then a `staff_profiles` upsert. A re-run re-applies the claims.
- `app/scripts/supabase-config-push.mjs`: copies `supabase/config.toml` into the CLI temp workdir and runs `config push --yes`.
- `app/scripts/lib/dev-vars.mjs`: the single writer of `app/.dev.vars` (append-missing).
- `app/worker/src/db/{client,events,staff}.ts`: the single data-access module.
- `app/worker/test/{events,signup-disabled}.test.ts`: live proofs.
- `supabase/config.toml`: `project_id` plus `[auth] enable_signup = false`.
- `app/wrangler.jsonc`, `app/worker-configuration.d.ts`: `secrets.required` and the regenerated `Env`.
- `app/scripts/hygiene-check.sh`: (h) requires a build first and fails on `sb_secret_` in `app/dist/client`.
- `app/scripts/lib/supabase-cli.mjs`: `getWorkdir` is now exported.
- `app/.dev.vars.example` and the companion docs under `docs/`.

## Decisions Made

See `key-decisions` in the frontmatter. The most important one: a secret key is accepted only when it has the full `sb_secret_` shape (requested with `--reveal`). A masked CLI value can therefore never be pushed as the Worker secret.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `--reveal` added to `supabase projects api-keys`**
- **Found during:** Task 1
- **Issue:** CLI 2.120.0 masks secret keys unless `--reveal` is passed (`--help`: "Reveal the secret API keys in full"). The plan's command would have returned a masked value that still starts with `sb_secret_`.
- **Fix:** Added `--reveal`, plus a full-shape regex check before anything is written.
- **Files modified:** `app/scripts/provision-secrets.mjs`
- **Commit:** `53209dd`

**2. [Rule 2 - Critical] `lib/dev-vars.mjs` shared helper; `.dev.vars` created with mode 0600**
- **Found during:** Task 1
- **Issue:** Both scripts must append to `.dev.vars` without ever overwriting a line.
- **Fix:** One helper, `appendMissingDevVars`, writes for both scripts. It puts comments on their own lines, because dotenv inline comments are unsafe, and creates the file with mode 0600.
- **Files modified:** `app/scripts/lib/dev-vars.mjs`, `docs/app/scripts/lib/dev-vars.md`
- **Commit:** `53209dd`

**3. [Rule 1 - Bug] `create-staff.mjs` re-applies `app_metadata` for an existing user**
- **Found during:** Task 1 (idempotency re-run)
- **Issue:** On `email_exists` the plan only upserts the profile. A user whose claims drifted would keep wrong `firm_id`/`role` claims while `staff_profiles` said otherwise.
- **Fix:** Added `auth.admin.updateUserById(id, { app_metadata })`. The re-run printed `exists …` and `updated … — password unchanged`.
- **Commit:** `53209dd`

**4. [Rule 3 - Blocking] `getWorkdir` exported from `lib/supabase-cli.mjs`**
- **Found during:** Task 2
- **Issue:** `supabase-config-push.mjs` must copy `config.toml` into the CLI's temp workdir, which was private.
- **Fix:** Exported it (one word) and updated its doc.
- **Commit:** `febcf45`

**5. [Rule 3 - Blocking, orchestrator-directed] Live-test commands use `pnpm -C app run test:live`**
- **Found during:** Task 2
- **Issue:** The plan's verify command `pnpm -C app exec dotenv -e .env -e .dev.vars -- vitest …` names an env file, and the secret-read hook blocks it.
- **Fix:** Ran `pnpm -C app run test:live`, which loads the same files from `package.json` and covers both new suites. The suites are confirmed not skipped: 34/34 passed by name.
- **Commit:** n/a (verification only)

**6. [Rule 3] `client.ts` keeps the double-quoted error string**
- **Issue:** The acceptance grep expects `throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY")` with double quotes. `prettier --check` (single quotes) would flag this one line. It is not part of `pnpm check`.
- **Commit:** `53209dd`

---

**Total deviations:** 6 (1 Rule 1, 1 Rule 2, 4 Rule 3).
**Impact on plan:** No scope creep. Each one was needed for correctness or for the env/hook constraints.

## TDD Gate Compliance

- **Task 1 RED (`dcd6df3`):** `01-05-RED-EVIDENCE.json` → `RED_EVIDENCE_OK` (4/4 failing against a not-implemented stub). **Semantic assessment:** the three guard tests failed on their message assertion and the client test failed on the stub throw. There were no load or syntax faults.
- **Task 1 GREEN (`53209dd`):** 4/4 pass.
- **Task 3 RED (`e8690c8`):** `01-05-RED-EVIDENCE-task3.json` → `RED_EVIDENCE_OK` (8 events/staff tests failed against stubs, with the env loaded and the other live suites green in the same run). **Semantic assessment:** the failures were the missing behavior (stub throws). There was no import or fixture fault.
- **Task 3 GREEN (`fb71f11`):** 8/8 pass.
- **REFACTOR:** none needed.

## Authentication Gates

None. Wrangler used the Cloudflare token through the `dotenv -e ../.env` script. The Supabase CLI used its stored login.

## Issues Encountered

- **USER ACTION REQUIRED (blocked by the auto-mode safety classifier): redeploy with `secrets.required`.** `pnpm -C app run deploy` was denied, and the plan's step 7 was not run. The secrets already exist on the Worker, so the deploy is expected to pass. Run from the repo root:

  ```
  pnpm -C app run deploy
  node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev
  ```

  Until then, the live Worker runs the 01-03 build, which neither declares nor uses the secrets. The secret puts created new versions of that same code, and smoke is 4/4 green.
- The `sb_secret_` key already existed (`default`, type `secret`), so the plan's `user_setup` step needed no action and no USER-SETUP.md was generated.

## Known Stubs

None. The RED stubs were replaced in the GREEN commits.

## User Setup Required

- Read the demo staff passwords from `app/.dev.vars` (`DEMO_STAFF_PASSWORD`, `STAFF_PASSWORD__*`). They are never committed.
- Run the redeploy commands above.

## Next Phase Readiness

- Plan 06 can verify a staff JWT, then call `getStaffProfile(env, sub)` and compare `firm_id`/`role` with `app_metadata`. Sign-in for both seeded users is proven live.
- Every later write of an audit event must use `logEvent`. A future migration that adds an actor type must update `ActorType`.
- The next per-wave hygiene gate must build first: `pnpm -C app build && bash app/scripts/hygiene-check.sh`.

---
*Phase: 01-foundation-staff-sign-in*
*Completed: 2026-10-11*

## Self-Check: PASSED

All 22 created code/doc files exist; commits dcd6df3, 53209dd, febcf45, e8690c8, fb71f11 are ancestors of HEAD; plan verification re-run: wrangler secret list shows the 3 names, test:live 34/34, check green, build + hygiene ok, smoke 4/4 on the current deployment; the SUMMARY contains no key material. Open: redeploy (USER ACTION).
