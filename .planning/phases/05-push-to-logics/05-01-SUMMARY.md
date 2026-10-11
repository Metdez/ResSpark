---
phase: 05-push-to-logics
plan: 01
subsystem: worker
tags: [logics, postgres, rpc, state-machine, cloudflare-queues, supabase, vitest]
status: complete

requires:
  - phase: 01-foundation-staff-sign-in
    provides: "logicsWriteGuard, LOGICS_WRITE_ENABLED/LOGICS_TEST_CASE_IDS, log_event, staffAuth"
  - phase: 02-find-the-client-send-the-link
    provides: "LogicsClient + createFakeLogicsClient, liveClientFromRow, firm_integrations, LOGICS_MODE"
  - phase: 03-uploads-review-live-status
    provides: "documents (ready, sha256, size_bytes), approved request_items, case-documents bucket"
  - phase: 04-connect-payroll-bank
    provides: "queue consumer (jobs/index.ts) and Job envelope"
provides:
  - "migration 0006_logics_push: logics_push_batches, logics_pushes, fingerprint partial unique index, firm_integrations.settings, eight state-guarded RPCs"
  - "db/logics-pushes.ts: fingerprintHex, firm-scoped reads, RPC wrappers with fixed error tokens"
  - "write-types.ts: LOGICS_MAX_PART_BYTES, DocResult/ActivityResult, zod guards, LogicsWriteClient, FakeWriteOptions"
  - "LogicsClient.createCaseDocument / createActivity / listActivities (live and fake)"
  - "jobs/logics-push.ts handleLogicsPushPart (ack-after-dispatch) and jobs/logics-push-finalize.ts (one note per batch)"
  - "POST /api/admin/requests/:id/logics-push, GET /api/admin/requests/:id/logics-pushes, POST /api/admin/logics-pushes/:pushId/resolve"
  - "/api/config.logics_mode"
affects: [05-03 consumer hardening and sweeper cron, 05-04 push UI, 05-05 settings and live switch]

actuals:
  tokens: 47000
  tasks: 3
  commits: 8
plan_head_before: 66d873becd2b6c00c0e3a1d1ce9621b6eb03a234
plan_head_after: eb0206c

tech-stack:
  added: []
  patterns:
    - "state-guarded claim RPC with a per-case transaction-scoped advisory lock (never held across HTTP)"
    - "ack-after-dispatch: the queue handler owns ack/retry; ack in finally once the POST starts"
    - "exactly-once side effect by an UPDATE ... WHERE state='pending' flip that returns NULL to losers"

key-files:
  created:
    - supabase/migrations/0006_logics_push.sql
    - app/worker/src/db/logics-pushes.ts
    - app/worker/src/integrations/logics/write-types.ts
    - app/worker/src/integrations/logics/write-types.test.ts
    - app/worker/src/integrations/logics/client-write.test.ts
    - app/worker/src/jobs/logics-push.ts
    - app/worker/src/jobs/logics-push-finalize.ts
    - app/worker/src/jobs/logics-push-finalize.test.ts
    - app/worker/src/routes/admin-logics-push.ts
    - app/worker/src/routes/admin-logics-push.test.ts
    - app/worker/test/logics-push.test.ts
    - app/worker/test/logics-rpc.test.ts
    - app/worker/test/fixtures/logics-push.ts
    - docs/supabase/migrations/0006_logics_push.md
    - docs/app/worker/src/db/logics-pushes.md
    - docs/app/worker/src/integrations/logics/write-types.md
    - docs/app/worker/src/jobs/logics-push.md
    - docs/app/worker/src/jobs/logics-push-finalize.md
    - docs/app/worker/src/routes/admin-logics-push.md
    - docs/app/worker/test/logics-push.test.md
    - docs/app/worker/test/logics-rpc.test.md
    - docs/app/worker/test/fixtures/logics-push.md
  modified:
    - app/worker/src/integrations/logics/client.ts
    - app/worker/src/integrations/logics/fixtures.ts
    - app/worker/src/integrations/logics/lookup.test.ts
    - app/worker/src/jobs/index.ts
    - app/worker/src/routes/config.ts
    - app/worker/src/index.ts
    - app/worker/test/config.test.ts
    - app/worker/test/rls.test.ts
    - docs/app/worker/src/integrations/logics/client.md
    - docs/app/worker/src/integrations/logics/fixtures.md
    - docs/app/worker/src/jobs/index.md
    - docs/app/worker/src/routes/config.md
    - docs/app/worker/src/index.md
    - docs/app/worker/test/config.md
    - docs/app/worker/test/rls.test.md

key-decisions:
  - "logics_push_claim takes pg_advisory_xact_lock per case before the NOT EXISTS check, so two different rows of one case can never both reach sending; the lock lives only for the RPC transaction"
  - "A refused claim retries (30 s) only when the row is still queued; a redelivery for a sending/terminal/missing row is acked, so a sent row is never retried"
  - "Pre-dispatch refusals (guard, mode_changed, logics_no_credentials, normalization_pending) fail the row and finalize the batch with a stand-in note client that records the refusal instead of opening a connection"
  - "Live-test cases are permanent test-firm cases ...e5 (900001) and ...e6 (900002): events are append-only and reference cases, so cases are never deleted"
  - "client.ts was not split: it is 207 lines with the three write methods"

patterns-established:
  - "Ledger RPC errors surface as fixed tokens; SQLSTATE 23505 on the fingerprint index maps to already_pushed"

requirements-completed: [PUSH-01, PUSH-03, PUSH-04]

coverage:
  - id: D1
    description: "Migration 0006 applied and recorded: both tables, 18 D-01 columns, partial fingerprint index, 8 RPCs, no PUBLIC/anon/authenticated grants"
    requirement: PUSH-04
    verification:
      - kind: integration
        ref: "node app/scripts/db-migrate.mjs --status / --dry-run (0 pending) and the four verify queries (18, 1, 8, 0)"
        status: pass
      - kind: integration
        ref: "app/worker/test/rls.test.ts (38 passed incl. logics_push_batches, logics_pushes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fake-mode push end to end: route guard refusals, batch + queued row + one queue message, handler sends through FakeLogicsClient, ack once, retry never, row sent, one activity note, ledger GET, redelivery acked"
    requirement: PUSH-01
    verification:
      - kind: integration
        ref: "app/worker/test/logics-push.test.ts (7 passed, live)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ledger state machine: claim race, sibling refusal, transition table, sent-needs-proof check, fingerprint 23505, finalize-once, all-failed skipped, mark_sent/resend, sweep"
    requirement: PUSH-04
    verification:
      - kind: integration
        ref: "app/worker/test/logics-rpc.test.ts (10 passed, live)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Exactly one activity note per batch with Andrew's wording, split-part labels, rs: refs, unconfirmed line, 4,000-char cap"
    requirement: PUSH-03
    verification:
      - kind: unit
        ref: "app/worker/src/jobs/logics-push-finalize.test.ts (7 passed)"
        status: pass
      - kind: integration
        ref: "app/worker/test/logics-rpc.test.ts#(e) two concurrent finalizes"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live LogicsClient write methods speak the vendor contract and map every outcome to sent/failed/unknown without throwing"
    requirement: PUSH-01
    verification:
      - kind: unit
        ref: "app/worker/src/integrations/logics/client-write.test.ts + write-types.test.ts (26 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Admin push routes: validation, guard messages, 404/422/503/409 mapping, settings pass-through, enqueue per push id, resolve"
    requirement: PUSH-01
    verification:
      - kind: unit
        ref: "app/worker/src/routes/admin-logics-push.test.ts (13 passed)"
        status: pass
    human_judgment: false
  - id: D7
    description: "A real Logics tenant accepts the multipart CaseDocument POST and the JSON Activity POST as built (no sandbox exists; live mode stays off)"
    verification: []
    human_judgment: true
    rationale: "Logics has no sandbox and writes are disabled (LOGICS_MODE=fake, LOGICS_WRITE_ENABLED=false); the first live write needs Andrew's write key, a test CaseID and the Plan 05 live switch"

duration: ~3h wall (two session restarts)
completed: 2026-10-11
---

# Phase 5 Plan 01: Logics push ledger tracer Summary

**Staff can now push approved documents to a Logics case through a state-guarded ledger: migration 0006 adds the batches and pushes tables, a fingerprint guard, and eight RPCs. A queue handler claims each part, sends it, acks the message once the POST has started, and records the outcome as `sent`, `failed`, or `unknown`. Each batch gets exactly one activity note. The whole path was tested end to end in fake mode against the live database.**

## Performance

- **Duration:** about 3 h wall clock, including two session restarts (resumed from the intact transcript)
- **Started:** 2026-10-11T09:43Z
- **Completed:** 2026-10-11T12:58Z
- **Tasks:** 3
- **Files:** 13 code/test files created, 8 code files modified, 24 docs created or updated

## Accomplishments

- **Migration `0006_logics_push`:** applied to `zvkphuikjpwoauqdimcf` and recorded. `--status` prints `0002_platform_foundation`, `0003_requests`, `0004_uploads_review`, `0005_connections`, `0006_logics_push`, and `--dry-run` reports `0 pending`. Verify queries: 18 D-01 columns; the fingerprint index has a `WHERE` clause; there are 8 functions; there are 0 PUBLIC/anon/authenticated routine grants and 0 table grants.
- **Ack-after-dispatch handler:** `handleLogicsPushPart` contains exactly one `msg.retry(`, used only for a refused claim on a row that is still `queued`. `msg.ack()` sits in the `finally` around `createCaseDocument`. The guard runs in both the route and the consumer, and in both modes. A row queued in one mode and consumed in the other fails with `mode_changed`.
- **Live fake-mode run:** produced synthetic **CaseDocumentID 181799** and **ActivityID 9323307** (each run draws new random ids). The row ended `sent` with `attempts 1`, and the batch's `activity_state` is `sent`.
- **Test case IDs:** `900001` for the tracer and `900002` for the RPC matrix. Both are permanent cases of the test firm. A leak check found 0 `logics_pushes` rows outside the test firm, and 0 rows remain after cleanup.
- **Deploy:** `pnpm -C app run check` passed on the whole tree (74 files passed, 1018 tests), then one `pnpm -C app run deploy` produced version `32457784-13da-4fce-8118-92fecbd1f7f2` with `LOGICS_MODE=fake` and `LOGICS_WRITE_ENABLED=false`. `GET /api/config` on the deployed Worker returns `logics_mode: "fake"`. The push route answers 401 without a token.

## Phase 4 dispatcher found, and how the push branch bypasses it

`jobs/index.ts` `queue(batch, env)` loops over messages and runs `runJob`, then `m.ack()`. On a transient `ProviderError` it calls `m.retry({ delaySeconds: 60·2^attempts })`; on any other error it records the failure and acks. A `logics_push` message is now caught **before** that `try`. It goes to `handleLogicsPushPart(m, env)` and then `continue`, so the generic retry can never redeliver a document POST. A throw from the handler is only logged. The message is implicitly acked when `queue()` returns, and the sweeper turns a row left in `sending` into `unknown`. In the DLQ branch, a `logics_push` message is acked with no record: its row is still `queued`, so the sweeper's `requeue` list covers it.

## Planner assumptions recorded

1. **An all-failed batch becomes `skipped` with no activity note.** `logics_push_finalize_batch` sets `activity_state = 'skipped'` when no part is `sent` or `unknown`, because nothing reached Logics.
2. **A staff-confirmed `sent` row may have no `logics_document_id`.** The `logics_pushes_sent_has_id` check accepts `resolved_by` instead, so "I checked Logics — it's there" works even when staff do not know the CaseDocumentID. Test (g) proves it.

## Task Commits

1. **Task 1: tracer (migration, ledger, handler, routes, live proof)**
   - `c848914` feat: migration 0006, ledger wrappers, Logics write surface
   - `517c407` feat: queue handler, finalizer, admin push routes, config
   - `fd61d1e` test: live fake-mode tracer, RLS coverage, companion docs
   - `ca37038` feat: mount the push routes in `index.ts` (shared file)
   - `eb0206c` style: lowercase `jsonb` on the settings line (text only)
2. **Task 2: live client write methods + tests:** `4a61826`. The implementation landed in `c848914`, as the plan allowed.
3. **Task 3: RPC matrix + route/finalize unit tests:** `e4721c0`, `65dc96b`

## Decisions Made

See `key-decisions`. Most important: the claim takes a per-case `pg_advisory_xact_lock` before the plan's `NOT EXISTS` predicate. Without the lock, two consumers claiming **different** rows of one case at the same instant could both pass `NOT EXISTS` under READ COMMITTED.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Race between sibling claims**
- **Found during:** Task 1 (migration)
- **Issue:** The plan's single `UPDATE ... WHERE NOT EXISTS (sibling sending)` does not serialize two different rows of one case. Both statements can see no sibling and both commit `sending`, which breaks D-02.
- **Fix:** The claim takes `pg_advisory_xact_lock(hashtextextended('logics_push:'||case_id,0))` first. It is transaction-scoped and released at commit, never held across HTTP.
- **Files modified:** `supabase/migrations/0006_logics_push.sql`
- **Commit:** `c848914`

**2. [Rule 3 - Blocking] Phase 2 test stub no longer satisfied `LogicsClient`**
- **Found during:** Task 1
- **Issue:** `lookup.test.ts` `stubClient` lacked the three new write methods, so `tsc` failed.
- **Fix:** The stub spreads the fake client.
- **Commit:** `c848914`

**3. [Rule 1 - Bug] Test cases cannot be deleted**
- **Found during:** Task 1 (live test design)
- **Issue:** The plan's `afterAll` deletes the `cases` row. But `events.case_id` has no `ON DELETE` and events are append-only, so that delete would fail.
- **Fix:** `fixtures/logics-push.ts` uses permanent test-firm cases `…e5` (900001) and `…e6` (900002). They stay separate from the shared `TEST_CASE_ID`, whose `logics_case_id` must stay NULL. Everything else is deleted.
- **Commit:** `fd61d1e`

**4. [Rule 2 - Missing critical] Pre-dispatch refusals still finalize the batch safely**
- **Found during:** Task 1
- **Issue:** The plan calls `finalizeBatchIfDone(env, batch, client)` after a pre-dispatch `failed`. On the guard and credential paths no client may be built.
- **Fix:** A stand-in `createActivity` records the refusal code on the batch note instead of opening a connection.
- **Commit:** `517c407`

**5. [Plan sequencing] Task 2 TDD order**
- The plan has Task 1 implement the live write methods so `tsc` passes on the tracer ("implement them here and let Task 2 own the tests"). Task 2 therefore added tests to existing code. There was no RED commit; all 26 tests passed on the first run.

**Total deviations:** 4 auto-fixed (2 bugs, 1 blocking, 1 missing critical) plus 1 sequencing note. **Impact:** no scope change. The claim is strictly safer than specified.

## Shared-file protocol

`app/worker/src/index.ts` carried 04-02's uncommitted `adminConnectionsRoute` hunk. I waited until 04-02 committed it (`ca37038` contains only my two lines). My commits to `app/worker/src/jobs/index.ts` and `app/worker/test/rls.test.ts` contained only my hunks. I did not touch `app/wrangler.jsonc` or `app/package.json`.

## Issues Encountered

- One full-suite `check` run failed `src/features/requests/request-builder.test.tsx` with a `waitFor` timeout. That file is not mine (load flake). It passed alone, and the next full `check` was green.
- The raw `git rev-list --count plan_head_before..HEAD` is 32 because four executors commit to the same branch. This plan's commits, measured with `--grep "(05-01)"` over that range, number 8.

## Known Stubs

- `app/worker/src/jobs/logics-push.ts` `ensureNormalized`: in pass-through-only mode, images, oversized PDFs, and stored parts fail with `normalization_pending`. This is intentional per plan (a `shortcut:` comment names Plan 03, which wires `normalizeForLogics` and `logics_push_add_parts`).

## Threat Flags

None beyond the plan's threat model. The new endpoints are the three planned admin routes behind `staffAuth`, firm-scoped in SQL.

## User Setup Required

None for fake mode. A live write still needs Andrew's write-scoped key, a test CaseID, and the Plan 05 live switch (USER ACTION, out of scope here).

## Next Phase Readiness

Plan 03 can wire `logics_push_sweep` to the cron and replace `ensureNormalized` with `normalizeForLogics` + `addParts`. Plan 04 can build the UI against the three routes and `logics_mode`.

## Self-Check: PASSED

- All 22 created files and 15 modified files exist; commits `c848914`, `517c407`, `fd61d1e`, `4a61826`, `e4721c0`, `65dc96b`, `ca37038`, `eb0206c` are ancestors of HEAD.
- Acceptance greps for Tasks 1–3 passed. `grep -c "msg.retry(" logics-push.ts` = 1, and `grep -c "SET search_path = ''"` = 8, with no `SECURITY DEFINER`, `DROP`, or `RENAME`.
- Live: `logics-push.test.ts` + `logics-rpc.test.ts` 17/17 passed (not skipped); `pnpm -C app run check` green; leak query `n = 0`.
