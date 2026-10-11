---
phase: 03-uploads-review-live-status
plan: 07
subsystem: testing
tags: [supabase, postgres, rpc, live-tests, rls, vitest]

requires:
  - phase: 03-uploads-review-live-status
    provides: migration 0004 (request_status, request_apply_status, upload_complete, item_approve, item_reject, request_dashboard_v), listItemDocuments, uploads.test.ts
provides:
  - app/worker/test/fixtures/request.ts (TEST_FIRM_ID, TEST_CASE_ID, liveEnvOrSkip, seedRequest, cleanupRequest), the one seeding path for live Phase 3 suites
  - app/worker/test/request-status.test.ts, a live matrix for every D-06 edge plus the review RPCs
  - app/worker/test/phase3-anon.test.ts, a live proof that the publishable key cannot read the 0004 view or call any of the five functions
affects: [03-03 staff review routes, 03-04 dashboard, 03-06, later live suites that seed requests]

actuals:
  tokens: 7900
  tasks: 2
  commits: 4
plan_head_before: efe0c9a149cdf65022563214630e5b447a345835
plan_head_after: 64782323e26de4d5c788ed6cb8369bbf79e302cf

tech-stack:
  added: []
  patterns:
    - "Live-suite cleanup is scoped to the seeded request's item ids, not the shared permanent case, so parallel live files cannot delete each other's rows"
    - "In a describe.skipIf suite, build clients in beforeAll: skipIf still collects the body"

key-files:
  created:
    - app/worker/test/fixtures/request.ts
    - app/worker/test/request-status.test.ts
    - app/worker/test/phase3-anon.test.ts
    - docs/app/worker/test/fixtures/request.md
    - docs/app/worker/test/request-status.test.md
    - docs/app/worker/test/phase3-anon.test.md
  modified:
    - app/worker/test/uploads.test.ts
    - docs/app/worker/test/uploads.test.md

key-decisions:
  - "The request-status test asserts the D-06 derivation as written: with A approved and B pending, the request is `opened`, not `in_progress` as the plan text said. Approved items are not counted as activity. Flagged as an open product question; 0004 was not changed."
  - "Anon denial checks live in a new phase3-anon.test.ts, not rls.test.ts, because Plan 04-01 owns rls.test.ts during this run. rls.test.ts already lists request_dashboard_v."
  - "cleanupRequest never deletes the case. The permanent case 0000e1 has append-only events, and events.case_id has no ON DELETE."

requirements-completed: [UPL-03, UPL-04]

coverage:
  - id: D1
    description: "request_status/request_apply_status derive and store every D-06 edge live: empty, boundary, complete, reject-after-complete, re-complete, optional adjacency, zero-required"
    requirement: UPL-04
    verification:
      - kind: integration
        ref: "app/worker/test/request-status.test.ts (pnpm -C app run test:live:file worker/test/request-status.test.ts)"
        status: pass
    human_judgment: false
  - id: D2
    description: "item_approve/item_reject semantics: idempotent approve with no second event, item_not_submitted, note_required, cross-firm item_not_found, reject flips ready documents with the note"
    requirement: UPL-03
    verification:
      - kind: integration
        ref: "app/worker/test/request-status.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "listItemDocuments orders documents with the same uploaded_at by id"
    requirement: UPL-04
    verification:
      - kind: integration
        ref: "app/worker/test/request-status.test.ts#documents with the same uploaded_at list in id order"
        status: pass
    human_judgment: false
  - id: D4
    description: "Publishable key gets 401/42501 and no data for request_dashboard_v and all five 0004 functions"
    verification:
      - kind: integration
        ref: "app/worker/test/phase3-anon.test.ts; app/worker/test/rls.test.ts (pnpm -C app run test:rls)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Whether a request with approved items and only pending items left should read 'opened' or 'in_progress' (product wording)"
    verification: []
    human_judgment: true
    rationale: "The tests prove the SQL matches D-06 as written. Whether D-06 says what the firm wants is a product decision."

duration: 13min
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 07: Request status machine and anon denial live proofs Summary

**Live Vitest matrix against `zvkphuikjpwoauqdimcf` covering every D-06 edge of `request_status()`, `request_apply_status()`, `item_approve` and `item_reject`, plus a publishable-key suite where the dashboard view and all five 0004 functions return 401 / `42501` with no data. Both suites seed through one shared test-firm fixture.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-11T08:56:45Z
- **Completed:** 2026-10-11T09:09:45Z
- **Tasks:** 2
- **Files created/modified:** 8

## Accomplishments

- `fixtures/request.ts` is now the one seeding path. `uploads.test.ts` and `request-status.test.ts` both seed through it and clean up through it, and `uploads.test.ts` keeps its assertions unchanged (5/5).
- `request-status.test.ts` has 12 live cases, run in order on one request plus a second request that has zero required items. It proves the empty, boundary, idempotent, complete-then-reject, re-complete, optional-adjacency, cross-firm and ordering edges. For every `request_apply_status` call it also checks that the stored `requests.status` equals what `request_status` derives.
- `phase3-anon.test.ts` uses an anon `supabase-js` client to try `request_dashboard_v` and `rpc('request_status' | 'request_apply_status' | 'upload_complete' | 'item_approve' | 'item_reject')`. **Every call returned HTTP 401, Postgres code `42501`, `data: null`.**
- `request_dashboard_v` in `rls.test.ts` (`pnpm -C app run test:rls`, 28/28) returned **401 with `42501`**, not an empty 200.
- Re-runnable: the two live suites passed three times in a row (17/17 each run). Afterwards the test firm had 0 `requests` rows, 0 `client_links` rows, and the test case had 0 `documents` rows.

## Task Commits

1. **Task 1: Shared live fixture + request_status / review-RPC matrix**: `6013dea` (test)
2. **Task 2: Anon denial of the 0004 view and five functions**: `ee1469e` (test), plus fix `6478232` (the client is now built in `beforeAll` so the suite skips cleanly without env)

`actuals.commits: 4` is measured from the ledger. One of the four, `72b3dd8`, belongs to Plan 02-08, which committed to the same branch during this run.

## Files Created/Modified

- `app/worker/test/fixtures/request.ts`: `TEST_FIRM_ID`, `TEST_CASE_ID`, `liveEnvOrSkip`, `seedRequest`, `cleanupRequest`
- `app/worker/test/request-status.test.ts`: the D-06 / review-RPC matrix
- `app/worker/test/phase3-anon.test.ts`: publishable-key denial for the view and five functions
- `app/worker/test/uploads.test.ts`: now seeds and cleans through the fixture
- `docs/app/worker/test/{fixtures/request,request-status.test,phase3-anon.test}.md`: new companion docs
- `docs/app/worker/test/uploads.test.md`: delta for the fixture

## Decisions Made

See `key-decisions` in the frontmatter. The main one: the test asserts the D-06 derivation as written (approved + pending gives `opened`) instead of the plan's `in_progress`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan expected `in_progress` after approving A while B is pending; the deployed SQL derives `opened`**
- **Found during:** Task 1
- **Issue:** Behavior step "`item_approve(A)` → `in_progress` (B pending)" contradicts locked D-06 ("in_progress when any item is in_progress/submitted/rejected"), the 03-01 truth, and the `0004` SQL. All three exclude `approved` from activity. The live run returned `{ item_status: 'approved', request_status: 'opened' }`.
- **Fix:** The test asserts `opened`, with a comment that cites D-06. Migration 0004 was not changed: it is applied, this plan allows no migration, and 04-01 is adding 0005 at the same time.
- **Files modified:** app/worker/test/request-status.test.ts
- **Commit:** 6013dea

**2. [Rule 1 - Bug] Plan 01's cleanup deleted by the shared case, which raced a parallel live suite**
- **Found during:** Task 1
- **Issue:** `uploads.test.ts` deleted every `documents` row of the permanent case `0000e1`. Vitest runs files in parallel, so that `afterAll` could delete `request-status.test.ts` documents mid-run.
- **Fix:** `cleanupRequest` scopes Storage removal and the `documents` delete to the request's item ids. It does not use the case prefix the plan suggested.
- **Files modified:** app/worker/test/fixtures/request.ts
- **Commit:** 6013dea

**3. [Rule 3 - Blocking] `cleanupRequest` does not delete cases**
- **Found during:** Task 1
- **Issue:** The plan's interface lists `cases` in the cleanup order. `events.case_id` has no `ON DELETE`, so the permanent case cannot be deleted, and the orchestrator says never delete cases.
- **Fix:** The fixture always uses the permanent `TEST_CASE_ID` and leaves it in place. It also returns `link_version` alongside `link_id` so `uploads.test.ts` can mint its token. The link row is inserted directly with the same columns `createClientLink` writes, so the fixture needs no Worker env.
- **Commit:** 6013dea

**4. [Orchestrator-directed] The anon checks are in `phase3-anon.test.ts`, not `rls.test.ts`**
- **Issue:** Plan 04-01 owns `rls.test.ts` during this run. `request_dashboard_v` was already in its relation list (Plan 01), with the strict 401 + `42501` assertion.
- **Fix:** A new live file uses the plan's anon `.rpc(...)` calls with zero uuids. It asserts `data === null` and `{status: 401, code: '42501'}`, at least as strict as the plan's "non-2xx with no data". `docs/app/worker/test/rls.test.md` was not touched; the new suite has its own doc.
- **Commit:** ee1469e

**5. [Rule 1 - Bug] `phase3-anon.test.ts` crashed `pnpm test` when env was missing**
- **Found during:** Plan-level `check`
- **Issue:** `describe.skipIf` still runs the describe body during collection, and `createClient` threw `supabaseUrl is required`.
- **Fix:** The client is now built in `beforeAll`.
- **Commit:** 6478232

**6. [Rule 3 - Blocking] The verify commands use the `test:live:file` / `test:rls` scripts**
- **Issue:** The plan's verify commands (`dotenv -e .env -e .dev.vars`; `--project web` for rls) do not load `../src/frontend/.env`, which holds the publishable key. `rls.test.ts` also lives in the `worker-node` project, not `web`. Under the orchestrator's secret rule, live tests run only through package scripts.
- **Fix:** Used `pnpm -C app run test:live:file <files>` and `pnpm -C app run test:rls`.

**Total deviations:** 5 auto-fixed (3 bugs, 2 blocking) plus 1 orchestrator-directed relocation. **Impact:** test-only; no production code or migration changed.

## TDD Gate Compliance

Both tasks are `tdd="true"`, but they only prove SQL that was already applied in 03-01. No implementation step existed for a RED test to precede, so each task is one `test(03-07)` commit whose tests passed on first run against the live project. The one wrong expectation the plan carried (deviation 1) was the closest thing to RED, and it was settled by matching locked D-06.

## Issues Encountered

- During this run `pnpm -C app run check` failed in `tsc -b` twice, both times in Plan 04-01's uncommitted files (`worker/src/integrations/**` missing `db/connections`, then `worker/src/index.ts` queue handler typing). A re-run of `tsc -b` a minute later passed. Every `check` step passed when run separately: file sizes, golden fixtures, `tsc -b`, `eslint .` (0 errors, 6 pre-existing warnings), and `pnpm test` (47 passed, 8 skipped files, 764 tests).

## Open Question for the User

- **D-06 wording:** a request with some items approved and the rest still `pending` (none in progress, submitted or rejected) shows **Opened** on the staff side. If the firm expects **In progress** once anything has been approved, `request_status()` needs `approved` added to `n_active`. That would be a new additive migration plus flipping one assertion in `request-status.test.ts`.

## Verification

- `pnpm -C app run test:live:file worker/test/request-status.test.ts worker/test/uploads.test.ts`: 2 files, 17/17, run three times.
- `pnpm -C app run test:live:file worker/test/phase3-anon.test.ts`: 6/6, before and after the `beforeAll` fix.
- `pnpm -C app run test:rls`: 28/28 (`request_dashboard_v` 401 / `42501`).
- `pnpm -C app test`: 47 passed, 8 skipped files; 764 passed, 76 skipped. Without env the new live suites skip cleanly.
- Leftovers under the test firm after the runs: 0 requests, 0 client_links, 0 documents.

## Known Stubs

None.

## Next Phase Readiness

Plan 03's review routes can call `item_approve` / `item_reject` with proven semantics. The one open item is the D-06 wording question above.

## Self-Check: PASSED

- FOUND: app/worker/test/fixtures/request.ts, app/worker/test/request-status.test.ts, app/worker/test/phase3-anon.test.ts, docs/app/worker/test/fixtures/request.md, docs/app/worker/test/request-status.test.md, docs/app/worker/test/phase3-anon.test.md
- FOUND commits: 6013dea, ee1469e, 6478232
