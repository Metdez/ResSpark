---
phase: 05-push-to-logics
verified: 2026-10-11T15:30:00Z
status: gaps_found
score: 6/8 must-haves verified
covered_files:
  - .planning/phases/05-push-to-logics/05-01-PLAN.md
  - .planning/phases/05-push-to-logics/05-01-SUMMARY.md
  - .planning/phases/05-push-to-logics/05-02-PLAN.md
  - .planning/phases/05-push-to-logics/05-02-SUMMARY.md
  - .planning/phases/05-push-to-logics/05-03-PLAN.md
  - .planning/phases/05-push-to-logics/05-03-SUMMARY.md
  - .planning/phases/05-push-to-logics/05-04-PLAN.md
  - .planning/phases/05-push-to-logics/05-04-SUMMARY.md
  - .planning/phases/05-push-to-logics/05-05-PLAN.md
  - .planning/phases/05-push-to-logics/05-05-SUMMARY.md
  - app/src/features/logics-push/api.ts
  - app/src/features/logics-push/logics-push-card.tsx
  - app/src/features/logics-push/plan.ts
  - app/src/features/logics-push/push-sheet.tsx
  - app/src/features/logics-push/resolve-unknown-dialog.tsx
  - app/src/features/logics-push/use-logics-push.ts
  - app/src/features/settings/integrations/push-settings-card.tsx
  - app/worker/src/db/integrations.ts
  - app/worker/src/db/logics-pushes.ts
  - app/worker/src/integrations/logics/client.ts
  - app/worker/src/integrations/logics/fixtures.ts
  - app/worker/src/integrations/logics/write-guard.ts
  - app/worker/src/integrations/logics/write-types.ts
  - app/worker/src/jobs/logics-push-finalize.ts
  - app/worker/src/jobs/logics-push-normalize.ts
  - app/worker/src/jobs/logics-push-sweep.ts
  - app/worker/src/jobs/logics-push.ts
  - app/worker/src/pdf/image-to-pdf.ts
  - app/worker/src/pdf/normalize-for-logics.ts
  - app/worker/src/pdf/split-pdf.ts
  - app/worker/src/routes/admin-logics-push.ts
  - app/worker/src/storage/logics-parts.ts
  - app/wrangler.jsonc
  - supabase/migrations/0006_logics_push.sql
covered_digest: "v3:sha256:cdd18e4ff412936ea822c276b343ba7a16696cee885ed1c80ab612c3074a237f"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "In live mode every Logics write path applies the env guard (LOGICS_WRITE_ENABLED), the test-CaseID allowlist, and the firm write_enabled toggle"
    status: failed
    reason: "The firm write_enabled toggle is checked only in POST /requests/:id/logics-push. POST /logics-pushes/:pushId/resolve (action=resend) does not check it, and the consumer's prepare() does not check it either. In live mode, after an admin turns Write enabled off, a staff Re-send (or a row already queued or re-enqueued by the sweeper) still POSTs to Logics. The env guard and the allowlist still run in the consumer, so only test CaseIDs are reachable."
    artifacts:
      - path: "app/worker/src/jobs/logics-push.ts"
        issue: "prepare() runs logicsWriteGuard in live mode but never reads readSettings(integration).write_enabled"
      - path: "app/worker/src/routes/admin-logics-push.ts"
        issue: "the resolve route queues a resend without the firm toggle (and without the env guard; only the consumer catches that)"
    missing:
      - "In prepare() (jobs/logics-push.ts), read the firm row with getIntegration(env, job.firm_id, 'logics') in both modes (it is already read in live mode) and, if !readSettings(row).write_enabled, return { code: 'logics_write_blocked', detail: 'Logics writes are turned off for this firm in Settings', noteClient: refusedNote('logics_write_blocked') } before any client is built"
      - "Optional, for a clear message in the UI: in the resolve route, when action === 'resend', apply the same live-mode env guard and firm toggle as the create route and return 403 logics_write_blocked"
      - "One unit test in jobs/logics-push.test.ts: live mode, guard passes, settings.write_enabled false -> row failed logics_write_blocked, createCaseDocument never called"
human_verification:
  - test: "Accept or reject the D-10 deviation from roadmap SC1. SC1 says that with LOGICS_WRITE_ENABLED off the push is refused. Since 05-05 (d3e5304), in fake mode the push is accepted and simulated while the flag is off. The deployed config is fake/false, so demo pushes go through as simulated."
    expected: "A human accepts this as an override (fake mode writes nothing real; the guard applies in live mode) or asks for a change"
    why_human: "It was a deliberate design choice (locked D-10 and the Demo Cut), so a human must accept it; the verifier cannot"
  - test: "Deployed UI rehearsal on https://resspark.zh-a16.workers.dev after the orchestrator's deploy. Turn on Write enabled under Settings > Integrations > Push settings. Open a request that has an approved, ready upload and push one small PDF."
    expected: "The banner reads 'SANDBOX · Logics writes simulated'. The button reads 'Push to Logics (simulated)'. The sheet shows the comment preview 'Uploaded via ResSpark by {agent} — {file}' and the activity note preview. The chip goes Queued -> Sending -> Sent with a #id and a 'Simulated' badge. One logics.activity_sent event appears for the batch."
    why_human: "Visual, real-time UI flow. 05-05 records it as not done; only the automated live fake-mode e2e ran"
  - test: "Firm 'Write enabled' switch: with the switch off, try a push"
    expected: "403 with 'Logics writes are turned off for this firm in Settings', shown in the sheet. With the switch on, the push queues."
    why_human: "This is a USER ACTION demo step on live firm settings, and the verifier must not write to the live DB"
  - test: "Before LOGICS_MODE=live: Andrew provides a write-scoped key (case.write and activity.write), its Secret Token, 2-3 test CaseIDs, and the FileCategoryID. Then follow docs/app/logics-live-switch.md in order."
    expected: "Test connection is green, LOGICS_TEST_CASE_IDS holds only test ids, and the first live push records a real CaseDocumentID and ActivityID on a test case"
    why_human: "External vendor credentials and a deliberate config flip; Logics has no sandbox"
---

# Phase 5: Push to Logics Verification Report

**Phase Goal:** As a ValorTax case manager, I want to push approved documents into the client's Logics case with one click, so that the file is complete in the system of record without downloading and re-uploading by hand.
**Verified:** 2026-10-11T15:30:00Z
**Status:** gaps_found (1 small gap, live mode only; it does not affect the fake-mode demo)
**Re-verification:** No (initial verification)

## User Flow Coverage (MVP)

| Step | Expected | Evidence in codebase | Status |
|------|----------|----------------------|--------|
| Staff opens a request with approved items | The push card lists approved, ready files | `request-page.tsx:183` (HEAD) mounts `LogicsPushCard`; card tests pass | VERIFIED |
| Staff selects files and clicks Push | Sheet shows the plan, the comment preview and the note preview; confirm sends ids only | `push-sheet.tsx` posts `{document_ids, push_again?}`; route `admin-logics-push.ts` creates a batch and one queue message per row | VERIFIED |
| The file reaches the Logics case | Consumer normalizes and POSTs `Documents/CaseDocument` with a comment and FileCategoryID | `jobs/logics-push.ts` and `client.ts:147`; `client-write.test.ts` multipart test | VERIFIED (fake); live depends on Andrew's key |
| One note per batch | `CaseActivity/Activity` posted once by the finalize winner | SQL `activity_state='pending'` flip in `logics_push_finalize_batch` + `finalize.test.ts` | VERIFIED |
| Staff sees the ledger and resolves unknowns | Chips for queued/sending/sent/failed/unknown; a two-action dialog | `logics-push-card.tsx`, `resolve-unknown-dialog.tsx` (mark_sent / Re-send) | VERIFIED |

Outcome clause ("the file is complete in the system of record"): achieved in fake mode end to end. In live mode it waits on the vendor key (USER ACTION).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Staff push approved items with a comment and the configured file category; the ledger shows queued/sending/sent/failed/unknown (SC1, PUSH-01) | VERIFIED | Comment is `Uploaded via ResSpark by {agent} — {file} (part n of m)` (`buildDocumentComment`). This meets SC1's "a comment such as" Andrew's wording. `FileCategoryID` is omitted when null (`client-write.test.ts` "adds FileCategoryID only when configured"). Ledger states are a CHECK in 0006 |
| 2 | With LOGICS_WRITE_ENABLED off or a CaseID outside the allowlist the push is refused with a clear message (SC1, PLAT-05) | UNCERTAIN | Live mode: refused with clear messages (route tests "403 ... writes are off in live mode", "403 ... allowlist"; consumer test "write guard refusing in live mode"). Fake mode: accepted on purpose (d3e5304, D-10), so the literal SC1 wording is not met. Needs an override decision; see Human Verification 1 |
| 3 | One activity note per push batch names the agent and the documents (SC2, PUSH-03) | VERIFIED | `logics_push_finalize_batch` flips `pending -> sending` only when no part is queued or sending; losers get NULL. `buildActivityComment` names the agent and every sent part. Tests: "does nothing when another caller won", "posts one note", "posts nothing for an all-failed batch" |
| 4 | Nothing over the gate is ever sent; oversize files are split into parts of at most 5,767,168 bytes or marked needs_manual_compression (SC3, PUSH-02) | VERIFIED | Four layers. (1) `splitPdf` throws `split_invariant`. (2) `normalizeForLogics` throws `normalize_invariant`. (3) The live and fake `createCaseDocument` both refuse `> LOGICS_MAX_PART_BYTES` (5,767,168) before fetch (test "refuses a 5_767_169-byte part ... never calls fetch", "sends exactly 5_767_168"). (4) Every normalize error code sets `needs_manual_compression=true` (`ensureNormalized` sets `manual: true`; consumer test "a file that cannot be shrunk ... never sent"). The UI flags HEIC, >40 MB, and unsupported types before the click (`plan.ts`) |
| 5 | An `unknown` result asks staff to decide; there is no blind retry (SC4, PUSH-04) | VERIFIED | Consumer acks in `finally` once dispatch starts. The only `retry` is a refused claim (nothing sent). `jobs/index.ts` routes `logics_push` around the generic retry. The DLQ never touches push rows. The sweeper moves stale `sending` to `unknown`. The dialog has exactly two actions. Tests: "unknown ... acks once", "runtime throw mid-dispatch is acked once and recorded unknown" |
| 6 | No code path can write to real Logics while LOGICS_MODE=fake | VERIFIED | `prepare()` builds `createFakeLogicsClient()` whenever `LOGICS_MODE !== 'live'` and never reads credentials. The fake client never calls fetch. A row queued in another mode fails `mode_changed`. The only other live-client use is Test connection (`admin-integrations.ts:133`), which does GETs only (`findByEmail`, `listActivities`). Deployed `/api/config` returns `logics_mode: fake`, `logics_write_enabled: false`. Live DB: 0 rows with `mode='live'` |
| 7 | In live mode the env guard, the test-CaseID allowlist, and the firm write_enabled toggle all apply to every write | FAILED | The env guard and allowlist run in the route and in the consumer (live). The firm toggle runs only in the create route. The resend route and the consumer skip it. See Gaps |
| 8 | A document part is never pushed twice | VERIFIED | Partial unique index `logics_pushes_fingerprint_live` (queued/sending/sent) on sha256(case, doc sha256, part). `create_batch` refuses queued/sending/sent/unknown unless `push_again`, and `sent` still hits 23505 -> `already_pushed`. The claim is state-guarded with a per-case advisory lock. `add_parts` skips any existing fingerprint. Re-sends reuse stored, hash-checked bytes. Live DB: 0 duplicate live fingerprints. Warning: see Anti-Patterns row 1 |

**Score:** 6/8 truths verified (0 present, behavior-unverified; 1 uncertain, 1 failed)

**Override suggestion for truth 2.** This looks intentional. To accept it, add to the frontmatter:

```yaml
overrides:
  - must_have: "With LOGICS_WRITE_ENABLED off or a CaseID outside the allowlist the push is refused with a clear message"
    reason: "D-10: the env guard protects real Logics writes and runs in live mode in both route and consumer; fake mode writes nothing real and must push for the demo. The firm write_enabled toggle still refuses in both modes."
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `supabase/migrations/0006_logics_push.sql` | VERIFIED | Applied (`db-migrate --status` lists 0006). RLS on, grants revoked, 8 RPCs |
| `app/worker/src/routes/admin-logics-push.ts` | VERIFIED | Mounted at `index.ts:66` |
| `app/worker/src/jobs/logics-push*.ts` | VERIFIED | Wired from `jobs/index.ts` (HEAD) and `cron.ts:72` (sweep) |
| `app/worker/src/pdf/*` | VERIFIED | Used by `logics-push-normalize.ts` |
| `app/worker/src/integrations/logics/client.ts`, `fixtures.ts`, `write-types.ts` | VERIFIED | Live and fake write methods with the size gate |
| `app/src/features/logics-push/*` | VERIFIED | Card, sheet, dialog and hooks are mounted on the request page |
| `push-settings-card.tsx` | VERIFIED | File category, activity type, Write enabled |
| Companion docs | VERIFIED | `docs/` mirrors exist for all 19 Phase 5 code files; every file is under 500 lines |

### Key Link Verification

| From | To | Status |
|------|----|--------|
| Push sheet | `POST /api/admin/requests/:id/logics-push` | WIRED |
| Route | `logics_push_create_batch` + `env.JOBS.send` | WIRED |
| Queue consumer | `handleLogicsPushPart` (ack-after-dispatch branch) | WIRED |
| Consumer | `ensureNormalized` -> `normalizeForLogics` -> Storage `logics/` parts | WIRED |
| Consumer | `finalizeBatchIfDone` -> `createActivity` | WIRED |
| Cron | `logicsPushSweep` | WIRED |
| Resolve dialog | `POST /logics-pushes/:id/resolve` -> `logics_push_resolve` | WIRED |
| Firm `write_enabled` | consumer / resend | NOT_WIRED (gap) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 5 unit suites (21 files) | `pnpm -C app exec vitest run <phase 5 files>` | 157/157 passed | PASS |
| Deployed mode | `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev` | 13/13 ok, `logics_mode=fake` | PASS |
| Deployed config | `GET /api/config` | `logics_write_enabled:false, logics_mode:fake` | PASS |
| Migration applied | `node app/scripts/db-migrate.mjs --status` | 0006_logics_push listed | PASS |
| Ledger state (read-only) | `supabase db query` on `logics_pushes` | 0 rows, 0 live rows, 0 duplicate live fingerprints, RLS on | PASS |

### Probe Execution

No probes declared for this phase. Not applicable.

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| PUSH-01 | SATISFIED (fake); live gating gap on the resend path | Truths 1, 2, 7 |
| PUSH-02 | SATISFIED | Truth 4 |
| PUSH-03 | SATISFIED | Truth 3 |
| PUSH-04 | SATISFIED | Truths 5, 8 |

No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `logics-push-card.tsx` / `0006` `create_batch` | 61-73 / 140 | "Push again" on an `unknown` row queues a new part-0 row and leaves the old row `unknown`. The unique index excludes `unknown`, so this bypasses the two-action dialog and D-04's "only after the old one is marked failed" | Warning | A deliberate staff action can create a duplicate in Logics. Smallest fix: offer Push again only for `sent` rows, or have `create_batch` mark a pushed-again `unknown` row `failed` (`resent_by_staff`) like `resolve` does |
| `logics-push-card.tsx` | 61 | "Push again" on a `sent` row always ends in 409 `already_pushed` (unique index) | Info | Dead UI option; harmless to data |
| `jobs/logics-push.ts` | n/a | D-03 "401/403 stops the whole batch" is not implemented; sibling parts are still sent and fail `auth` one by one | Info | No duplicate risk; extra failed calls only |
| `0006` `logics_push_resolve` | 408-420 | A resent row joins a batch whose note is already written, so the resent file never appears in an activity note | Info | Keeps "one note per batch"; a resend is not noted |

No TBD/FIXME/XXX markers in Phase 5 files.

### Human Verification Required

1. **D-10 override decision (truth 2).** Accept fake-mode pushes while `LOGICS_WRITE_ENABLED=false`, or change it.
2. **Deployed UI rehearsal.** Push one small PDF in fake mode and watch the chips go Queued -> Sending -> Sent with the Simulated badge, the activity preview, and the SANDBOX banner wording.
3. **Firm "Write enabled" switch.** An admin turns it on for the demo; with it off, the push is refused in the sheet.
4. **Andrew's write key and test CaseIDs.** Required before `LOGICS_MODE=live` (`docs/app/logics-live-switch.md`).

### Gaps Summary

There is one gap, and it only matters in live mode. The firm `write_enabled` toggle is enforced only when a batch is created. The staff Re-send path and the consumer do not check it. Real-tenant writes are still blocked unless the env flag is on and the CaseID is on the allowlist, which both run in the consumer. Fix it in `prepare()` in `app/worker/src/jobs/logics-push.ts`: read the firm settings and refuse `logics_write_blocked` when `write_enabled` is false, then add one unit test. The fake-mode demo path is unaffected. Everything else that was asked to be confirmed holds in code and tests:
- Fake mode cannot reach real Logics.
- A document part is not pushed twice, apart from the "Push again on unknown" warning above.
- There is one note per batch.
- Nothing over 5,767,168 bytes is sent.

---

_Verified: 2026-10-11T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
