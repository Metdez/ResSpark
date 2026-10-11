---
phase: 02-find-the-client-send-the-link
plan: 01
subsystem: database
tags: [supabase, postgres, rls, plpgsql, rpc, vitest, live-test]

requires:
  - phase: 01-foundation-staff-sign-in
    provides: "0002 platform tables (firms, events, client_links, log_event), db-migrate.mjs runner, rls.test.ts, createAdminClient"
provides:
  - "Live tables firm_integrations, request_templates (2 global seeds), requests, request_items, client_sessions"
  - "cases Logics identity/contact columns + unique (firm_id, logics_case_id); client_links.request_id NOT NULL + FK + unique"
  - "Six SECURITY INVOKER RPCs: case_confirm_logics, request_create, request_send, request_regenerate_link, request_revoke, request_open"
  - "Error tokens for the Worker: no_items, case_not_found, request_not_found, request_not_draft, request_not_active, request_revoked, link_inactive"
  - "PLAT-02 proof over all 25 public tables + request_send anon probe"
  - "pnpm -C app run test:requests (live lifecycle test)"
affects: [02-03, 02-04, 02-05, 02-06, 02-07, 02-08, phase-03-mirror-view]

actuals:
  tokens: 11700
  tasks: 2
  commits: 8
plan_head_before: f631aeb7d1f3ff0b3c84ac3bbdeb03f52b73d6ee
plan_head_after: 3c855325b66699c98302e306a1af279a684f6b4d

tech-stack:
  added: []
  patterns:
    - "RPC per state transition: lock requests row FOR UPDATE, then client_links; event via public.log_event in the same transaction"
    - "Bare-token RAISE EXCEPTION messages the Worker maps to error codes"
    - "RETURNS TABLE output names that collide with columns are disambiguated with a table alias (cl.version)"
    - "Explicit GRANT EXECUTE ... TO service_role after REVOKE FROM PUBLIC for every RPC"

key-files:
  created:
    - supabase/migrations/0003_requests.sql
    - app/worker/test/requests-live.test.ts
    - docs/supabase/migrations/0003_requests.md
    - docs/app/worker/test/requests-live.test.md
  modified:
    - app/worker/test/rls.test.ts
    - docs/app/worker/test/rls.test.md
    - app/package.json

key-decisions:
  - "requests carries contact_email and contact_phone_e164 (planner assumption beyond D-06) for D-09 email and the LOOK-04 send-time comparison; user to confirm or overrule"
  - "Fixed lock order requests -> client_links in every RPC, including request_open, so concurrent open/revoke cannot deadlock"
  - "The live-test probe case (Logics id 999999001) is a permanent fixture: events.case_id has no ON DELETE and events is append-only, so a case with events cannot be deleted; afterAll deletes only its requests"
  - "Six RPCs granted EXECUTE to service_role explicitly (revoking PUBLIC removes the inherited grant), matching 0002's log_event"

patterns-established:
  - "New live test files get a scoped package script (test:requests) that loads env through dotenv-cli"

requirements-completed: [LOOK-04, LOOK-05, REQ-01, REQ-03, PORT-02, PORT-04]

coverage:
  - id: D1
    description: "Migration 0003 applied to zvkphuikjpwoauqdimcf and recorded; tables, seeds, columns, NOT NULL, RLS, zero anon/authenticated grants, six invoker RPCs"
    verification:
      - kind: integration
        ref: "node app/scripts/db-migrate.mjs --status / --dry-run / --query checks (Task 1 verify)"
        status: pass
    human_judgment: false
  - id: D2
    description: "anon denied on all 25 public tables and on rpc/request_send"
    requirement: "PORT-02"
    verification:
      - kind: integration
        ref: "app/worker/test/rls.test.ts (pnpm -C app run test:rls, 27 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Request lifecycle state machine proven live: idempotent confirm, transactional create with ordered positions, send, idempotent open, regenerate, terminal revoke, error tokens, cross-firm refusal"
    requirement: "REQ-01"
    verification:
      - kind: integration
        ref: "app/worker/test/requests-live.test.ts (pnpm -C app run test:requests, 10 passed, twice)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-10-11
status: complete
---

# Phase 2 Plan 01: Requests Data Foundation Summary

**Migration 0003 live on Supabase: five RLS-locked request tables, two seeded templates, Logics identity columns on cases, and six SECURITY INVOKER RPCs (confirm, create, send, open, regenerate, revoke) that each log their event in one transaction, proven by a 10-test live lifecycle suite and a 27-test anon-denial suite.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-10-11T05:26:16Z
- **Completed:** 2026-10-11T05:36Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `0003_requests` applied through `node app/scripts/db-migrate.mjs`. `--status` prints `0002_platform_foundation` and `0003_requests`; `--dry-run` prints `0 pending`.
- `request_templates` holds 2 global seeds: `Standard resolution packet` with 5 items and `Documents only` with 3.
- `client_links` NOT NULL guard: the table had 0 rows, so the guard did not fire. `request_id` is now `NOT NULL` with an FK (`ON DELETE CASCADE`) and a unique index.
- Live checks: 25 public tables; the 5 new ones have RLS; 0 table, routine, and usage grants for `anon`/`authenticated`; the 6 RPCs have `prosecdef = false` and ACL `{postgres=X, service_role=X}`; `cases` has all 6 new columns.
- `rls.test.ts`: 27 passed (25 tables + `log_event` and `request_send` probes). `requests-live.test.ts`: 10 passed on two consecutive runs, leaving no requests, links, or items behind.

## RAISE tokens the Worker maps

`no_items`, `case_not_found` (request_create); `request_not_found` (send, regenerate, revoke when the request is not in `p_firm_id`); `request_not_draft` (send); `request_not_active` (regenerate); `request_revoked` (revoke); `link_inactive` (open). All are SQLSTATE `P0001` and appear verbatim as supabase-js `error.message`.

## Task Commits

1. **Task 1: Migration 0003 written and applied end-to-end** - `dfbe379` (feat)
2. **Task 2: PLAT-02 proof over 25 tables + live RPC lifecycle test** - `3c85532` (test)

The ledger range `f631aeb..3c85532` counts 8 commits because Plans 01-06, 01-08, and the orchestrator committed to the same branch while this ran. This plan's commits are the two above.

## Files Created/Modified

- `supabase/migrations/0003_requests.sql` (414 lines): tables, columns, guarded NOT NULL, FK, indexes, seeds, six RPCs, the trigger, and the grants block.
- `docs/supabase/migrations/0003_requests.md`: companion doc, one row per statement group, plus the token and event tables.
- `app/worker/test/rls.test.ts`: 5 new table names and the `request_send` probe.
- `app/worker/test/requests-live.test.ts` (200 lines): the live lifecycle test.
- `docs/app/worker/test/rls.test.md`, `docs/app/worker/test/requests-live.test.md`: companion docs.
- `app/package.json`: the `test:requests` script.

## Decisions Made

- **Planner assumption for you to confirm or overrule:** `requests.contact_email` and `requests.contact_phone_e164` exist beyond D-06's column list. They store the destination staff confirmed at send time, for the D-09 email action and the LOOK-04 send-time comparison.
- Every RPC takes the `requests` lock before the `client_links` lock, `request_open` included, so concurrent open and revoke cannot deadlock.
- `request_send`, `request_regenerate_link`, and `request_revoke` also raise `request_not_found` for an unknown or other-firm request. The plan already named this token in the action text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test cleanup cannot delete the probe case**
- **Found during:** Task 2
- **Issue:** The plan's `afterAll` deletes the test case row, with acceptance `cases where logics_case_id = 999999001` → `n: 0`. `events.case_id` references `cases` with no `ON DELETE` action, and `events` is append-only (a trigger rejects UPDATE and DELETE). Once `case_confirm_logics` logs `case.looked_up`, that delete always fails with FK error 23503.
- **Fix:** The probe case is a fixed fixture, which the idempotent upsert re-finds on every run. `afterAll` deletes only that case's requests, which cascades to items, link, and session. After two runs, the database holds `probe_cases = 1`, `probe_requests = 0`, `client_links = 0`, `request_items = 0`. The acceptance check now reads `n: 1` instead of `n: 0`.
- **Files modified:** `app/worker/test/requests-live.test.ts`, docs
- **Committed in:** `3c85532`

**2. [Rule 2 - Missing critical] Explicit `GRANT EXECUTE ... TO service_role` on the six RPCs**
- **Found during:** Task 1
- **Issue:** The plan revokes EXECUTE from PUBLIC. Without an explicit grant, the Worker's role could lose access, the same reason 0002 grants `log_event` to `service_role`.
- **Fix:** Six `GRANT EXECUTE ... TO service_role` lines. `anon`/`authenticated` still have 0 routine grants.
- **Committed in:** `dfbe379`

**3. [Rule 1 - Bug] Lock order in `request_open`**
- **Found during:** Task 1
- **Issue:** The plan locks the `client_links` row in `request_open`, while send, regenerate, and revoke lock `requests` first. That inverted order can deadlock under concurrency.
- **Fix:** `request_open` reads the link's `request_id`, locks the request, then locks the link. Its behavior is otherwise exactly as planned.
- **Committed in:** `dfbe379`

**4. [Rule 3 - Blocking] `test:requests` package script**
- **Issue:** The plan's verify command names the env files directly, and a hook blocks env-file names in shell commands.
- **Fix:** Added `"test:requests": "dotenv -e .env -e .dev.vars -- vitest run --project worker-node worker/test/requests-live.test.ts"`, as the orchestrator allowed. `test:rls` already existed.
- **Committed in:** `3c85532`

**5. Additions within plan intent:** `NOTIFY pgrst, 'reload schema'` at the end of the migration. Two extra live tests (10 instead of 9): `case_not_found` for another firm, and `request_not_found` on a cross-firm send (T-02-03).

---

**Total deviations:** 4 auto-fixed (2 bug, 1 missing critical, 1 blocking) plus 1 in-scope addition.
**Impact on plan:** Correctness and security only; no scope creep.

## TDD Gate Compliance

Task 2 is `tdd="true"`, but its implementation was the tracer Task 1, which the plan orders first and commits first. The lifecycle test was therefore green on its first run. This is the expected "feature already exists" case: there was no RED commit before the `feat` commit, and the test commit came after it. The test does exercise real behavior against the live database: every error token, idempotent open and upsert, position numbering, and the 14-day expiry window.

## Issues Encountered

- The auto-mode classifier denied a compound command that combined checks with the live apply. Running `node app/scripts/db-migrate.mjs` on its own, after a `--dry-run` showed only `0003_requests` pending, went through.

## Known Stubs

None.

## Next Phase Readiness

- Plans 03, 04, and 07 can call the six RPCs through `admin.rpc(...)` and map the tokens above.
- **Watch item:** the "Live Probe" case (Logics id `999999001`, firm ValorTax) persists in `cases`. Any admin case list built later should filter it out, or accept it as a known test row.
- `docs/app/README.md` (owned by 01-08 during this run) does not yet list `test:requests`; add it when that file is next free.

## Self-Check: PASSED

- Files exist: `supabase/migrations/0003_requests.sql`, `app/worker/test/requests-live.test.ts`, `docs/supabase/migrations/0003_requests.md`, `docs/app/worker/test/requests-live.test.md`.
- Commits `dfbe379` and `3c85532` are on `zack` (HEAD `3c85532`).
- Plan verification: `--dry-run` 0 pending; `--status` lists both migrations; rls 27/27; lifecycle 10/10; `python -m unittest discover -s src/tests` OK (27 tests); `pnpm -C app run check` green.

---
*Phase: 02-find-the-client-send-the-link*
*Completed: 2026-10-11*
