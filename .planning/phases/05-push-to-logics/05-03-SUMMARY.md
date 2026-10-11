---
phase: 05-push-to-logics
plan: 03
subsystem: api
tags: [logics, cloudflare-queues, cron, supabase-storage, pdf, settings]
status: complete

requires:
  - phase: 05-push-to-logics
    provides: "05-01 ledger, claim/transition/add_parts/sweep RPCs, handleLogicsPushPart; 05-02 normalizeForLogics, split/wrap, error codes"
  - phase: 04-connect-payroll-bank
    provides: "cron.ts step() pattern, jobs/index.ts DLQ branch, queue max_retries 5"
provides:
  - "ensureNormalized: download, sha256 check, split/wrap, parts stored under logics/{document_id}/part-k.pdf, sibling rows + messages, then dispatch"
  - "storage/logics-parts.ts: partPath, uploadPart (upsert), downloadPart"
  - "logicsPushSweep on every cron trigger (stale sending -> unknown consumer_lost; idle queued re-enqueued)"
  - "D-08 firm settings: readSettings/updateSettings, PUT /api/admin/integrations/logics/settings, ActivityType listing on Test connection, firm write toggle enforced by the push route"
affects: [05-04, 05-05, demo]

actuals:
  tokens: 26000
  tasks: 2
  commits: 20 # MEASURED on the shared `zack` branch: includes other executors' commits; this plan's own are 1070ea6, 30ea9be (+ the docs commit)
plan_head_before: 80b0ac9a10ff77b63f4998857f9de8f863b9dc32
plan_head_after: 0b1b7f3aea2844e530153862db1df8a0e25735ef

tech-stack:
  added: []
  patterns:
    - "Normalize once on part 0, store every part with its sha256, every later send reads stored bytes"
    - "Pre-dispatch failure after a claim: ack once, row failed, never retry"
    - "Test seams as an optional opts parameter (targetBytes, clientFactory) that production never passes"

key-files:
  created:
    - app/worker/src/jobs/logics-push-normalize.ts
    - app/worker/src/storage/logics-parts.ts
    - app/worker/src/jobs/logics-push-sweep.ts
    - app/worker/src/jobs/logics-push.test.ts
    - app/worker/src/jobs/logics-push-normalize.test.ts
    - app/worker/src/storage/logics-parts.test.ts
    - app/worker/src/jobs/logics-push-sweep.test.ts
    - app/worker/src/routes/admin-integrations.test.ts
  modified:
    - app/worker/src/jobs/logics-push.ts
    - app/worker/src/cron.ts
    - app/worker/src/db/integrations.ts
    - app/worker/src/routes/admin-integrations.ts
    - app/worker/src/routes/admin-logics-push.ts
    - app/worker/test/logics-push.test.ts

key-decisions:
  - "Firm write toggle (settings.write_enabled) defaults to false and blocks pushes in every mode, as planned; the demo firm must turn it on (USER ACTION)"
  - "updateSettings upserts only {firm_id, provider, settings}, so a firm can configure settings before saving credentials"
  - "Sweep runs as its own cron step on both triggers; its counts are not added to the cron.tick/cron.daily payload (the RPC logs per-row events)"
  - "No jobs/dlq.ts exists: the Phase 4 DLQ branch in jobs/index.ts already acks logics_push with no ledger write, so no code change"
  - "limits.cpu_ms left at default: the 12-page live run took 3.6-4.6 s wall for all 4 parts"

requirements-completed: [PUSH-02, PUSH-04]

coverage:
  - id: D1
    description: "Consumer normalizes oversize PDFs/images into stored, hashed parts with sibling rows and messages"
    requirement: PUSH-02
    verification:
      - kind: unit
        ref: "app/worker/src/jobs/logics-push-normalize.test.ts"
        status: pass
      - kind: integration
        ref: "pnpm -C app run test:live:file worker/test/logics-push.test.ts#normalizes into stored, hashed parts and sends every part once"
        status: pass
  - id: D2
    description: "Ack/retry matrix: no retry after a claim; storage_read_failed acks once and fails the row"
    requirement: PUSH-04
    verification:
      - kind: unit
        ref: "app/worker/src/jobs/logics-push.test.ts"
        status: pass
  - id: D3
    description: "Cron sweeper for stale sending and orphaned queued rows"
    requirement: PUSH-04
    verification:
      - kind: unit
        ref: "app/worker/src/jobs/logics-push-sweep.test.ts, app/worker/src/cron.test.ts"
        status: pass
  - id: D4
    description: "D-08 firm settings route, ActivityType listing, push-route write toggle"
    requirement: PUSH-03
    verification:
      - kind: unit
        ref: "app/worker/src/routes/admin-integrations.test.ts, app/worker/src/routes/admin-logics-push.test.ts"
        status: pass

duration: 45min
completed: 2026-10-11
---

# Phase 5 Plan 03: Normalization in the push consumer, sweeper, firm settings Summary

**The Logics push consumer now turns any pushable upload into ≤ 5.5 MiB PDF parts stored under `logics/{document_id}/part-k.pdf` with their own sha256 before dispatch. A cron sweeper unblocks lost consumers. Firms get the D-08 settings (file category, activity type, write toggle, real ActivityType listing).**

## Performance

- Duration: about 45 min (09:55 to 10:40 EDT)
- Tasks: 2 of 2
- Files: 14 created, 13 modified (code, tests and docs)

## Accomplishments

- `ensureNormalized(env, job, opts?)` replaces the Plan 01 `normalization_pending` seam. On part 0 it downloads the source and checks its sha256 against `documents.sha256` (`source_hash_mismatch`). It then runs `normalizeForLogics`, uploads every part (upsert) and calls `addParts` with fingerprints `fingerprintHex(case_id, sha, k)`. It enqueues one message per new sibling and returns part 0. A row that already has `part_storage_path` re-reads its stored bytes and checks them against `part_sha256` (`part_hash_mismatch`).
- `MANUAL_COPY` holds the five staff messages. If the normalizer reports `ok: false`, the row moves to `failed` with `needs_manual_compression = true` and that copy as `error_detail`.
- Consumer hardening:
  - A failure after the claim and before dispatch (guard, mode, credentials, normalize, storage read or write, hash) acks once and moves the row to `failed`. It never retries.
  - If `createCaseDocument` throws at runtime, the row is recorded `unknown` / `logics_no_response` and the message is still acked once.
  - `msg.retry(` appears exactly once, for a refused claim on a `queued` row.
- `logicsPushSweep` is wired into `scheduled()` as its own `step` on both triggers.
- `readSettings` / `updateSettings` live in `db/integrations.ts`:
  - `GET /logics` now also returns `settings` and `activity_types`.
  - New `PUT /logics/settings` (admin only) validates the body and logs `integration.logics.settings_updated` with the changed keys only.
  - Test connection lists ActivityType strings for the first allowlisted case and stores them in `activity_types_seen`. If the listing fails, the response gets `activity_types_error` and the test still passes.
- The push route refuses with 403 `Logics writes are turned off for this firm in Settings` when `write_enabled` is not true. This is in addition to the env guard. `file_category_id` and `activity_type` now come from `readSettings`; a null file category is never sent as 0.

## Recorded measurements (plan output spec)

- Live 12-page run (`makeMultiPagePdf(12, 60_000)`, about 720 KB, target 200,000 bytes): **4 parts, 181,270 bytes each, 4 distinct sha256s, consumer wall-clock 3.6 to 4.6 s** across 3 runs (fake client, `delayMs 0`; includes Storage upload/download and RPC round trips).
- `limits.cpu_ms`: not raised (well under 10 s).
- Phase 4 shapes found:
  - `cron.ts` has a `step(fallback, fn)` wrapper, `reconcileTick` on `*/15 * * * *` and `dailyJobs` on `0 3 * * *`. Cron triggers are `["*/15 * * * *", "0 3 * * *"]`.
  - The DLQ is a branch inside `jobs/index.ts` `queue()`, not a separate `jobs/dlq.ts`. It already acks `logics_push` without any record.
- Final settings defaults: `{ file_category_id: null, activity_type: 'General', write_enabled: false, activity_types_seen: [] }`.

## Task Commits

1. **Task 1: Normalization inside the consumer and the ack/retry matrix**: `1070ea6` (feat)
2. **Task 2: Sweeper on cron, DLQ rule, D-08 firm settings**: `30ea9be` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `jobs/dlq.ts` does not exist**
- Found during: Task 2
- Issue: the plan lists `app/worker/src/jobs/dlq.ts`, but the Phase 4 DLQ handler is the `batch.queue === DLQ` branch in `jobs/index.ts` (a file shared with 04-03). That branch already acks `logics_push` with no ledger write.
- Fix: no code change. The rule is documented in `docs/app/worker/src/jobs/logics-push-sweep.md`; `docs/app/worker/src/jobs/index.md` already describes it.

**2. [Rule 1 - Bug] Settings-dependent tests would break under the new write toggle**
- Found during: Task 2
- Issue: the default-false toggle makes every existing push test answer 403.
- Fix: the unit suites mock `settings.write_enabled: true`. The live suite turns the toggle on for the test firm only through `enableFirmWrites` and restores it in `afterAll`. It also asserts the 403 message once.
- Files: `app/worker/src/routes/admin-logics-push.test.ts`, `app/worker/test/logics-push.test.ts`, `app/worker/test/admin-integrations.test.ts` (that file mocked `db/integrations` wholesale; it now keeps the real `readSettings`).

**3. [Rule 2] `updateSettings` upserts instead of updating**
- Issue: a firm in fake mode may have no `firm_integrations` row yet, so a plain update would silently change nothing.
- Fix: upsert `{ firm_id, provider, settings }` on `(firm_id, provider)`. The credential columns are untouched.

**4. `FirmIntegrationRow.settings` is optional in TypeScript**
- The column is NOT NULL in SQL. Making the field required broke existing row literals in `admin-lookup.test.ts` and `admin-integrations.test.ts`, which are owned by earlier plans. `readSettings` treats a missing value as `{}`.

**5. TDD order**
- Because of the time box, implementation and tests were written in the same pass rather than strictly RED then GREEN. All suites pass. There is no separate RED commit.

**6. Pre-dispatch failure path acks before the transition**
- The Plan 01 order was transition then ack. It is now ack then transition, so `ack` is called exactly once even if the transition RPC throws. The row then stays `sending` and the sweeper moves it to `unknown`.

## Verification

- Unit: `logics-push`, `logics-push-normalize`, `logics-parts`, `logics-push-sweep`, `cron`, `admin-integrations` (both), and `admin-logics-push` all pass.
- Live (fake mode): `pnpm -C app run test:live:file worker/test/logics-push.test.ts` passes 9 of 9. `afterAll` removes the `logics/` part objects.
- Whole tree: `pnpm -C app run check` passes (file sizes, golden, tsc, eslint, 1,210 tests).
- The very first `check` run had 1 flaky failure under concurrent executor load. It was not reproducible in 3 later runs. Both heavy split tests now have 20 s timeouts.
- Deploy: `pnpm -C app run deploy` produced version `c8aed2dc-6524-4dbd-b553-07cdb2ff0f31`. `/api/config` returns `logics_mode: 'fake'` and `logics_write_enabled: false`. No real Logics write happened anywhere in this plan.

## USER ACTION

- **Before the demo, turn on the firm write toggle** for the ValorTax firm. Without it, every push answers 403 `Logics writes are turned off for this firm in Settings`, including in fake mode. No Settings UI for the toggle exists yet. An admin can call `PUT /api/admin/integrations/logics/settings` with `{ "write_enabled": true }`, or set `firm_integrations.settings = settings || '{"write_enabled": true}'` for that firm. The env guard (`LOGICS_WRITE_ENABLED`, allowlist) still applies on top.
- Andrew's answers on `FileCategoryID` / `ActivityType` are still open (D-08). Once real credentials are tested, Test connection fills `activity_types_seen`.

## Known Stubs

None. The `shortcut:` comment in `logics-push-normalize.ts` (a failed sibling `JOBS.send` is swallowed) is covered by the sweeper's re-enqueue of `queued` rows idle over 5 minutes.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: config-endpoint | app/worker/src/routes/admin-integrations.ts | New admin-only `PUT /logics/settings`, covered by T-05-17/T-05-18 (admin check, typed validation, event with keys only) |

## Self-Check: PASSED

- All created files exist on disk.
- Commits `1070ea6` and `30ea9be` are ancestors of HEAD.
