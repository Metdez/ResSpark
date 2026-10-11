---
phase: 05-push-to-logics
verified: 2026-10-11T16:06:08Z
status: human_needed
score: 8/8 must-haves verified
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
  - app/src/features/logics-push/logics-push-card.test.tsx
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
  - app/worker/src/jobs/logics-push.test.ts
  - app/worker/src/jobs/logics-push.ts
  - app/worker/src/pdf/image-to-pdf.ts
  - app/worker/src/pdf/normalize-for-logics.ts
  - app/worker/src/pdf/split-pdf.ts
  - app/worker/src/routes/admin-logics-push.test.ts
  - app/worker/src/routes/admin-logics-push.ts
  - app/worker/src/storage/logics-parts.ts
  - app/wrangler.jsonc
  - supabase/migrations/0006_logics_push.sql
  - supabase/migrations/0008_433a_prepopulation.sql
covered_digest: "v3:sha256:642258a64b03be9a95d59ae554d6bf75e54eaa4a0bc059b6b2afb63f868cb22c"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "With LOGICS_WRITE_ENABLED off or a CaseID outside the allowlist the push is refused with a clear message"
    reason: "D-10: the env guard protects real Logics writes and runs in live mode in both route and consumer; fake mode writes nothing real and must push for the demo. The firm write_enabled toggle still refuses in both modes."
    accepted_by: "orchestrator (per locked CONTEXT D-10: in fake mode nothing is written to Logics, so simulated pushes are allowed with LOGICS_WRITE_ENABLED=false; live mode still refuses; user may revoke)"
    accepted_at: 2026-10-11
re_verification:
  previous_status: gaps_found
  previous_score: 6/8
  gaps_closed:
    - "In live mode every Logics write path applies the env guard (LOGICS_WRITE_ENABLED), the test-CaseID allowlist, and the firm write_enabled toggle (627dd9f)"
    - "Warning: Push again on an unknown row could duplicate, closed in the UI (c1d52ed)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "The Worker route POST /requests/:id/logics-push still accepts push_again, and logics_push_create_batch (0008 body) lets a push_again document whose latest row is unknown be re-queued while that row stays unknown. Nothing in the UI sends push_again after c1d52ed, so only a hand-made staff API call reaches it."
    category: other
    reason: "Residual server-side half of the closed warning. Smallest fix: in admin-logics-push.ts pass pushAgain: [] (drop body.push_again), since no caller uses it; or exclude 'unknown' from the push_again bypass in create_batch."
    evidence_status: "none provided"
human_verification:
  - test: "Deployed UI rehearsal on https://resspark.zh-a16.workers.dev after the orchestrator deploys 627dd9f and c1d52ed. Turn on Write enabled under Settings > Integrations > Push settings. Open a request that has an approved, ready upload and push one small PDF."
    expected: "The banner reads 'SANDBOX · Logics writes simulated'. The button reads 'Push to Logics (simulated)'. The sheet shows the comment preview 'Uploaded via ResSpark by {agent} — {file}' and the activity note preview. The chip goes Queued -> Sending -> Sent with a #id and a 'Simulated' badge, then 'Already pushed' with no checkbox. One logics.activity_sent event appears for the batch."
    why_human: "Visual, real-time UI flow on the deployed Worker; only unit tests and the earlier fake-mode e2e ran"
  - test: "Firm 'Write enabled' switch: with the switch off, try a push (and, if an unknown row exists, a Re-send)"
    expected: "403 with 'Logics writes are turned off for this firm in Settings', shown in the sheet or dialog. With the switch on, the push queues. Note: since 627dd9f the consumer also re-checks the switch, so it must stay on until the demo batch reaches Sent."
    why_human: "USER ACTION demo step on live firm settings; the verifier must not write to the live DB"
  - test: "Before LOGICS_MODE=live: Andrew provides a write-scoped key (case.write and activity.write), its Secret Token, 2-3 test CaseIDs, and the FileCategoryID. Then follow docs/app/logics-live-switch.md in order."
    expected: "Test connection is green, LOGICS_TEST_CASE_IDS holds only test ids, and the first live push records a real CaseDocumentID and ActivityID on a test case"
    why_human: "External vendor credentials and a deliberate config flip; Logics has no sandbox"
---

# Phase 5: Push to Logics Verification Report

**Phase Goal:** As a ValorTax case manager, I want to push approved documents into the client's Logics case with one click, so that the file is complete in the system of record without downloading and re-uploading by hand.
**Verified:** 2026-10-11T16:06:08Z (re-verification; initial 2026-10-11T15:30:00Z)
**Status:** human_needed (no gaps; 3 human items, 1 override applied)
**Re-verification:** Yes, after gap closure (627dd9f, c1d52ed, dbc38ea). See "Re-verification (2026-10-11)" at the end.

## User Flow Coverage (MVP)

| Step | Expected | Evidence in codebase | Status |
|------|----------|----------------------|--------|
| Staff opens a request with approved items | The push card lists approved, ready files | `request-page.tsx:185` (HEAD) mounts `LogicsPushCard`; card tests pass | VERIFIED |
| Staff selects files and clicks Push | Sheet shows the plan, the comment preview and the note preview; confirm sends ids only | `push-sheet.tsx` posts `{document_ids}` (push_again removed in c1d52ed); route `admin-logics-push.ts` creates a batch and one queue message per row | VERIFIED |
| The file reaches the Logics case | Consumer normalizes and POSTs `Documents/CaseDocument` with a comment and FileCategoryID | `jobs/logics-push.ts` and `client.ts:147`; `client-write.test.ts` multipart test | VERIFIED (fake); live depends on Andrew's key |
| One note per batch | `CaseActivity/Activity` posted once by the finalize winner | SQL `activity_state='pending'` flip in `logics_push_finalize_batch` + `finalize.test.ts` | VERIFIED |
| Staff sees the ledger and resolves unknowns | Chips for queued/sending/sent/failed/unknown; a two-action dialog is the only way out of `unknown` | `logics-push-card.tsx` (unknown and sent rows not selectable), `resolve-unknown-dialog.tsx` (mark_sent / Re-send) | VERIFIED |

Outcome clause ("the file is complete in the system of record"): achieved in fake mode end to end. In live mode it waits on the vendor key (USER ACTION).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Staff push approved items with a comment and the configured file category; the ledger shows queued/sending/sent/failed/unknown (SC1, PUSH-01) | VERIFIED | Comment is `Uploaded via ResSpark by {agent} — {file} (part n of m)` (`buildDocumentComment`). `FileCategoryID` is omitted when null (`client-write.test.ts`). Ledger states are a CHECK in 0006 |
| 2 | With LOGICS_WRITE_ENABLED off or a CaseID outside the allowlist the push is refused with a clear message (SC1, PLAT-05) | PASSED (override) | Override: D-10, fake mode writes nothing real; accepted by orchestrator (per locked CONTEXT D-10; user may revoke) on 2026-10-11. Live mode still refuses in route and consumer (route tests "403 ... writes are off in live mode", "403 ... allowlist"; consumer test "write guard refusing in live mode") |
| 3 | One activity note per push batch names the agent and the documents (SC2, PUSH-03) | VERIFIED | `logics_push_finalize_batch` flips `pending -> sending` only when no part is queued or sending; losers get NULL. Tests: "does nothing when another caller won", "posts one note", "posts nothing for an all-failed batch" |
| 4 | Nothing over the gate is ever sent; oversize files are split into parts of at most 5,767,168 bytes or marked needs_manual_compression (SC3, PUSH-02) | VERIFIED | Four layers (split invariant, normalize invariant, client size gate before fetch, `manual: true` on every normalize error). Tests unchanged and passing |
| 5 | An `unknown` result asks staff to decide; there is no blind retry (SC4, PUSH-04) | VERIFIED | Consumer acks in `finally` once dispatch starts; sweeper moves stale `sending` to `unknown`; the UI now offers only the two-action dialog for `unknown` (c1d52ed, test "D-04: an unknown row cannot be selected or pushed again") |
| 6 | No code path can write to real Logics while LOGICS_MODE=fake | VERIFIED | `prepare()` builds the fake client whenever `LOGICS_MODE !== 'live'`; the only other live-client use is Test connection (GETs only). Unchanged by the closure |
| 7 | In live mode the env guard, the test-CaseID allowlist, and the firm write_enabled toggle all apply to every write | VERIFIED | Closed by 627dd9f. `prepare()` (`jobs/logics-push.ts:47-55`) reads the firm row in both modes and fails `logics_write_blocked` before any client is built; the resolve route (`admin-logics-push.ts:135-138`) returns 403 for `resend`. The only `createCaseDocument`/`createActivity` callers are the consumer and `finalizeBatchIfDone`, both behind `prepare()`. Behavioral tests pass (see Re-verification) |
| 8 | A document part is never pushed twice | VERIFIED | Fingerprint partial unique index, state-guarded claim, hash-checked re-sends. UI vector for "Push again on unknown" removed (c1d52ed). Residual server-side path recorded as advisory (see Re-verification) |

**Score:** 8/8 truths verified (1 by override; 0 present, behavior-unverified)

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `supabase/migrations/0006_logics_push.sql` (+ `create_batch` replaced in 0008) | VERIFIED | RLS on, grants revoked; 0008 re-grants `create_batch` to service_role only |
| `app/worker/src/routes/admin-logics-push.ts` | VERIFIED | Mounted at `index.ts:68` |
| `app/worker/src/jobs/logics-push*.ts` | VERIFIED | Wired from `jobs/index.ts:87-89` and `cron.ts:72` (sweep) |
| `app/worker/src/pdf/*` | VERIFIED | Used by `logics-push-normalize.ts` |
| `app/worker/src/integrations/logics/client.ts`, `fixtures.ts`, `write-types.ts` | VERIFIED | Live and fake write methods with the size gate |
| `app/src/features/logics-push/*` | VERIFIED | Mounted on the request page; all files under 500 lines (card 229) |
| `push-settings-card.tsx` | VERIFIED | File category, activity type, Write enabled |
| Companion docs | VERIFIED | Updated in 627dd9f and c1d52ed for every touched file |

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
| Firm `write_enabled` | create route, resend route, consumer `prepare()` | WIRED (was NOT_WIRED) |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| PUSH-01 | SATISFIED (fake); live waits on vendor key | Truths 1, 2 (override), 7 |
| PUSH-02 | SATISFIED | Truth 4 |
| PUSH-03 | SATISFIED | Truth 3 |
| PUSH-04 | SATISFIED | Truths 5, 8 |

No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `admin-logics-push.ts` / `0008` `create_batch` | 55, 113 / 432-437 | Route still accepts `push_again`; `create_batch` lets an `unknown` row's document be re-queued with the old row left `unknown`. No UI caller since c1d52ed | Warning (advisory) | Only a hand-made staff API call can create a duplicate. Smallest fix: drop `body.push_again` in the route (pass `pushAgain: []`) |
| `jobs/logics-push.ts` | n/a | D-03 "401/403 stops the whole batch" not implemented | Info | Extra failed calls only (unchanged) |
| `0006` `logics_push_resolve` | 408-420 | A resent file never appears in an activity note | Info | Unchanged |

No TBD/FIXME/XXX/TODO/HACK markers in the files touched by the closure.

### Human Verification Required

1. **Deployed UI rehearsal.** After the orchestrator deploys 627dd9f and c1d52ed, push one small PDF in fake mode and watch Queued -> Sending -> Sent with the Simulated badge, then "Already pushed" with no checkbox.
2. **Firm "Write enabled" switch.** With it off, push and Re-send are refused with the Settings message. Keep it on until the demo batch is Sent, because the consumer now re-checks it.
3. **Andrew's write key and test CaseIDs.** Required before `LOGICS_MODE=live` (`docs/app/logics-live-switch.md`).

### Gaps Summary

No gaps remain. The truth 7 gap is closed in the consumer and the resend route, with passing behavioral tests. The SC1 deviation is accepted by override (D-10). One advisory remains: the server still accepts `push_again`, which nothing in the UI sends.

---

_Verified: 2026-10-11T16:06:08Z_
_Verifier: Claude (gsd-verifier)_

## Gap closure (2026-10-11)

Closes the truth 7 gap and the "Push again on unknown" warning (Anti-Patterns rows 1 and 2). Not deployed by the executor; the orchestrator deploys.

### Gap: firm `write_enabled` not enforced after batch creation (truth 7) — commit `627dd9f`

- `app/worker/src/jobs/logics-push.ts` `prepare()`: after the live env guard and the `mode_changed` check, the firm row is read once with `getIntegration(env, job.firm_id, 'logics')` in both modes. If `readSettings(row).write_enabled` is not `true`, the row fails `logics_write_blocked` / "Logics writes are turned off for this firm in Settings" before any client (fake or live) is built. The message is acked once, the normalizer and `createCaseDocument` never run, and the batch finalizes with the refusal note client. The same row is reused for the live credential check, so there is no extra read in live mode.
- `app/worker/src/routes/admin-logics-push.ts` resolve route: when `action === 'resend'` and the firm switch is off → 403 `logics_write_blocked` with the same message, before `resolvePush` runs, so nothing is resolved or enqueued. `mark_sent` writes nothing to Logics and stays allowed. The live env flag and allowlist are still enforced for re-sends by the consumer (unchanged).
- Tests (all pass):
  - `jobs/logics-push.test.ts` "D-08: the firm switch turned off after queueing fails the row in fake mode; the client is never called" (failed `logics_write_blocked` with the Settings message, injected `createCaseDocument` spy never called, normalizer never called, ack once, no retry).
  - `jobs/logics-push.test.ts` "D-08: live mode with the env guard passing but the firm switch off never builds a live client" (`liveClientFromRow` never called, normalizer never called, ack once).
  - `routes/admin-logics-push.test.ts` "D-08: resend is 403 when the firm turned Logics writes off" (403 envelope, `resolvePush` and `JOBS.send` never called) and "mark_sent still works with the firm switch off".

Truth 7 now holds: in live mode the env guard, the allowlist, and the firm toggle apply to the create route, the resend route (toggle at the route, guard and toggle again in the consumer), and every consumer run, including rows re-enqueued by the sweeper.

### Warning: "Push again" on an `unknown` row could duplicate — commit `c1d52ed`

Choice: **"Push again" removed for both `unknown` and `sent`.** `logics_push_create_batch` (0006, and its 0008 replacement) inserts the `push_again` row with the same part-0 fingerprint, and the partial unique index `logics_pushes_fingerprint_live` covers `sent`. So a pushed-again `sent` document always ends in 409 `already_pushed`; the option could never succeed.

- `app/src/features/logics-push/logics-push-card.tsx`: a document whose latest rows include `unknown` or `sent` is not selectable. `unknown` shows only the "Needs your decision" chip, which opens the two-action resolve dialog (D-04: mark sent, or Re-send, which fails the old row first). `sent` shows "Already pushed" with no control. A `failed` row can still be selected and pushed fresh (the create RPC allows it).
- The now-dead browser plumbing was removed: `PushableDoc.pushAgain` (`plan.ts`), `push_again` in `push-sheet.tsx`, `api.ts` `createPush`, and `use-logics-push.ts`. The `already_pushed` copy now reads "Already pushed to Logics. Refresh to see its state." (it only shows when the ledger on screen was stale). The Worker route still accepts `push_again`; nothing in the UI sends it.
- Tests (all pass): `logics-push-card.test.tsx` "shows a sent row with its id, Simulated and Already pushed, with no way to push it again", "D-04: an unknown row cannot be selected or pushed again; only the decision dialog resolves it", "a failed row can be pushed again fresh"; `push-sheet.test.tsx` updated (the `push_again` forwarding case removed, new `already_pushed` copy).

### Checks

| Check | Result |
|-------|--------|
| `pnpm -C app exec vitest run worker/src/jobs/logics-push.test.ts worker/src/routes/admin-logics-push.test.ts src/features/logics-push` | 6 files, 59/59 passed |
| `tsc -b`, `eslint` on the touched files, `check-file-sizes` | clean (every touched file under 500 lines) |
| `pnpm -C app run check` (full) | 1513 passed, 1 failed, 2 files failed, none in this change: `worker/test/esign-start.test.ts` (06-02, file-level failure) and `logics-push-normalize.test.ts` "is deterministic" (flaky under the full run; passes 9/9 alone; the normalizer was not touched) |

Companion docs updated: `docs/app/worker/src/jobs/logics-push.md`, `logics-push.test.md`, `docs/app/worker/src/routes/admin-logics-push.md`, `docs/app/src/features/logics-push/{logics-push-card,plan,push-sheet,api,use-logics-push}.md`.

Still open (unchanged by this closure): Human Verification 1 (D-10 override), 2 (deployed UI rehearsal), 3 (firm switch demo step), 4 (Andrew's write key). Info rows 3 (D-03 batch stop on 401/403) and 4 (resent file not in an activity note) are not addressed.

## Re-verification (2026-10-11)

Verifier re-checked the committed code at HEAD (`10d04da`, branch `zack`). The working tree has unrelated uncommitted edits (`connect-copy.ts`, `esign-settings.ts`, `statement-cells.tsx`); none is a Phase 5 file, and the result is based on committed code only. Nothing was deployed or written to the live database, Storage, or Logics.

### Gap (truth 7): CLOSED

- `jobs/logics-push.ts:47-55` (HEAD): `getIntegration` + `readSettings(row).write_enabled` run in both modes, after the live env guard and the `mode_changed` check and before any client is built or `ensureNormalized` runs. `readSettings(null)` returns `write_enabled: false` (`db/integrations.ts:30-38`), so a missing firm row also refuses.
- `routes/admin-logics-push.ts:135-138`: `resend` with the switch off returns 403 `logics_write_blocked` before `resolvePush`.
- Write-path inventory (grep, non-test): `createCaseDocument` is called only at `jobs/logics-push.ts:119`, and `createActivity` only through `finalizeBatchIfDone` (`logics-push.ts:111, 138`). Both run after `prepare()`. A refused row gets `refusedNote`, so no activity POST. The only other live-client use is Test connection (`admin-integrations.ts:133`, GETs only).
- Named behavioral tests run individually, all pass: "D-08: the firm switch turned off after queueing fails the row in fake mode; the client is never called", "D-08: live mode with the env guard passing but the firm switch off never builds a live client", "D-08: resend is 403 when the firm turned Logics writes off; nothing resolved or enqueued". The test bodies assert that the client spy, `liveClientFromRow`, `ensureNormalized`, `resolvePush` and `JOBS.send` are never called.

Side effect worth knowing for the demo: the consumer now also refuses in fake mode when the switch is off, so turning it off mid-batch fails the remaining parts `logics_write_blocked`. That is the intended D-08 behavior.

### Warning ("Push again" on `unknown`): CLOSED in the UI; residual server path is advisory

- `logics-push-card.tsx` (HEAD): `disabled: plan.kind === 'manual' || inFlight || sent || unknown`; the "Push again" checkbox and the `again` state are gone. `push-sheet.tsx` posts `{ document_ids }` only; `api.ts` `createPush` no longer accepts `push_again`. Grep finds no `pushAgain`/`push_again` left in `app/src`.
- Tests pass: "D-04: an unknown row cannot be selected or pushed again; only the decision dialog resolves it", "shows a sent row ... with no way to push it again", "a failed row can be pushed again fresh".
- Residual (advisory, not blocking): `admin-logics-push.ts:55` still reads `body.push_again`, and the 0008 `logics_push_create_batch` (lines 432-437) bypasses the `unknown` check for listed ids without failing the old row. Only an authenticated staff member sending a hand-made request can reach it. Smallest fix: pass `pushAgain: []` in the route, or remove `'unknown'` from what `push_again` bypasses.

### SC1 / truth 2: override applied

The frontmatter `overrides` entry, accepted by the orchestrator per locked CONTEXT D-10 on 2026-10-11, is counted (`overrides_applied: 1`). Live mode still refuses in both the route and the consumer. The user may revoke it.

### Regression check

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Phase 5 unit suites (23 files: logics-push UI, settings/integrations, worker logics integrations, push jobs, pdf, route, storage) | `pnpm -C app exec vitest run src/features/logics-push src/features/settings/integrations worker/src/integrations/logics worker/src/jobs/logics-push worker/src/pdf worker/src/routes/admin-logics-push worker/src/storage/logics-parts` | 23 files, 202/202 passed | PASS |
| Gap-closure named tests | `vitest run ... -t "D-08\|D-04\|Already pushed\|pushed again fresh"` | 6/6 passed | PASS |
| Wiring | grep | `request-page.tsx:185` card, `jobs/index.ts:87-89` consumer, `cron.ts:72` sweep, `index.ts:68` route | PASS |
| File sizes | `wc -l` | largest touched file 229 lines | PASS |
| Debt markers | grep TBD/FIXME/XXX/TODO/HACK on touched files | none | PASS |

Not run: `tsc -b` (other executors' uncommitted edits could pollute it), the `worker/test/*` live suites, the deployed smoke, and read-only DB queries. The closure is not deployed yet, so the deployed Worker does not have it until the orchestrator deploys.
