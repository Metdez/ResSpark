---
phase: 05-push-to-logics
plan: 04
subsystem: ui
tags: [react, tanstack-query, shadcn, logics, vitest, jsdom]
status: complete

requires:
  - phase: 05-push-to-logics
    provides: "Plan 01 admin push routes (POST logics-push, GET logics-pushes, POST resolve), ledger states, /api/config.logics_mode"
  - phase: 03-uploads-review-live-status
    provides: "useReview(requestId) items + documents, ReviewPanel on the request page, pollInterval, unlessHandled, StatusBadge"
  - phase: 01-foundation-staff-sign-in
    provides: "SandboxBanner fail-safe rules, api()/isConfig, UI-SPEC palette and empty block"
provides:
  - "features/logics-push: plan.ts (pushPlan, planLabel, sizeLabel, PushableDoc), api.ts (fetchLedger, createPush, resolvePush, guards, PUSH_ERROR_COPY), use-logics-push.ts (useLedger, useCreatePush, useResolvePush, latestPushesByDocument)"
  - "LogicsPushCard mounted below ReviewPanel: approved ready files, selection, plan, ledger chips, Simulated badge, Already pushed / Push again"
  - "PushSheet confirmation with comment and activity-note previews; ResolveUnknownDialog with exactly two staff decisions"
  - "PushStatusBadge (queued/sending/sent/failed/unknown) in components/status-badge.tsx"
  - "AppConfig.logics_mode and the fake/live SANDBOX banner wording"
affects: [05-05 settings and live switch, 05 end-of-phase UAT]

actuals:
  tokens: 17600
  tasks: 2
  commits: 19
plan_head_before: 80b0ac9a10ff77b63f4998857f9de8f863b9dc32
plan_head_after: b1841f5

tech-stack:
  added: []
  patterns:
    - "Ledger chips come from the newest batch per document, one row per part_index (a staff resend's new row replaces the old one)"
    - "Refusals from push and resolve render in place (Alert); only a 401 reaches the app handler"

key-files:
  created:
    - app/src/features/logics-push/api.ts
    - app/src/features/logics-push/plan.ts
    - app/src/features/logics-push/plan.test.ts
    - app/src/features/logics-push/use-logics-push.ts
    - app/src/features/logics-push/logics-push-card.tsx
    - app/src/features/logics-push/logics-push-card.test.tsx
    - app/src/features/logics-push/push-sheet.tsx
    - app/src/features/logics-push/push-sheet.test.tsx
    - app/src/features/logics-push/resolve-unknown-dialog.tsx
    - app/src/features/logics-push/resolve-unknown-dialog.test.tsx
    - app/src/components/status-badge.test.tsx
    - docs/app/src/features/logics-push/api.md
    - docs/app/src/features/logics-push/plan.md
    - docs/app/src/features/logics-push/use-logics-push.md
    - docs/app/src/features/logics-push/logics-push-card.md
    - docs/app/src/features/logics-push/push-sheet.md
    - docs/app/src/features/logics-push/resolve-unknown-dialog.md
  modified:
    - app/src/features/requests/request-page.tsx
    - app/src/components/status-badge.tsx
    - app/src/features/layout/sandbox-banner.tsx
    - app/src/features/layout/sandbox-banner.test.tsx
    - app/src/lib/api.ts
    - app/src/lib/api.test.ts
    - docs/app/src/features/requests/request-page.md
    - docs/app/src/components/status-badge.md
    - docs/app/src/features/layout/sandbox-banner.md
    - docs/app/src/lib/api.md

key-decisions:
  - "sizeLabel is defined in plan.ts: review/document-row.tsx keeps its formatter private (formatSize), and document-row was left alone"
  - "Push tones live in status-badge.tsx as PushStatusBadge + PushState (the house StatusBadge takes tone/label, not a status key); StatusBadge gained an optional icon prop for the sending spinner"
  - "useCreatePush/useResolvePush take (requestId, caseId) because the ['events', caseId] invalidation needs the case id"
  - "The agent name in the previews comes from useSession().display_name, the same staff identity the Worker stamps on the batch"
  - "Rows in queued/sending are disabled without a Push again option (in flight); only sent/unknown offer Push again"
  - "The push button stays disabled until the ledger has loaded, because the duplicate guard depends on it"
  - "A failed row's dialog is titled 'Re-send this file?' (resend-only); the unknown title stays 'Logics didn't confirm this file'"

patterns-established:
  - "Mode labels read the ledger's mode: anything other than 'live' is labelled simulated"

requirements-completed: []

coverage:
  - id: D1
    description: "pushPlan/planLabel/sizeLabel: single, split estimate, image_to_pdf, HEIC by mime or extension, over 40 MB, unfinished; limit equals the Worker constant"
    requirement: PUSH-02
    verification:
      - kind: unit
        ref: "app/src/features/logics-push/plan.test.ts (7 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Push card: approved ready files only, empty block, selection enables the (simulated) button, ledger polled with pollInterval, Sent #id + Simulated, Already pushed / Push again, Needs your decision button, part k of n chips, manual-compression copy, sheet and dialog open"
    requirement: PUSH-01
    verification:
      - kind: unit
        ref: "app/src/features/logics-push/logics-push-card.test.tsx (9 passed)"
        status: pass
      - kind: unit
        ref: "app/src/components/status-badge.test.tsx (6 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Confirmation sheet: file lines, Won't be sent, comment and note previews, Push N files posts only sendable ids (+ push_again), in-place refusal copy, live warning"
    requirement: PUSH-01
    verification:
      - kind: unit
        ref: "app/src/features/logics-push/push-sheet.test.tsx (6 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Resolution dialog: exact copy, two decisions + Cancel focused, mark_sent with/without id, resend, failed resend-only, not_resolvable alert"
    requirement: PUSH-04
    verification:
      - kind: unit
        ref: "app/src/features/logics-push/resolve-unknown-dialog.test.tsx (6 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "SANDBOX banner: fake -> 'Logics writes simulated', live -> allowlist sentence, fail-safe default while loading/error/unknown mode, absent only in production"
    verification:
      - kind: unit
        ref: "app/src/features/layout/sandbox-banner.test.tsx (6 passed)"
        status: pass
      - kind: integration
        ref: "deployed version 4f98194e: GET /api/config returns logics_mode fake; served chunks contain 'Logics writes simulated' and 'Nothing approved yet'"
        status: pass
    human_judgment: false
  - id: D6
    description: "On the deployed sandbox, approve an item, push one PDF, and watch Queued -> Sending -> Sent with Simulated (Plan 05 end-of-phase check)"
    verification: []
    human_judgment: true
    rationale: "Needs a signed-in staff session and a real approved document; the Worker currently refuses pushes with logics_write_blocked while LOGICS_WRITE_ENABLED=false (Plan 05-05 owns that switch)"

duration: 40min
completed: 2026-10-11
---

# Phase 5 Plan 04: Push to Logics UI Summary

**The request page now has a `Push to Logics` card. It lists approved, ready files with what each push will do (`Sends as 1 file`, `Will split into about N parts`, `Converted to PDF`, `Needs manual compression — …`). Each file shows ledger chips that poll, plus a `Simulated` badge in fake mode. Staff confirm in a sheet that previews the comment and the activity note. An `unknown` result opens a dialog with exactly two staff decisions. The SANDBOX banner now says whether Logics writes are simulated.**

## Performance

- **Duration:** about 40 min
- **Started:** 2026-10-11T13:56Z
- **Completed:** 2026-10-11T14:36Z
- **Tasks:** 2
- **Files:** 11 code/test files created, 6 modified; 6 docs created, 4 updated

## Accomplishments

- `LogicsPushCard` sits directly below `<ReviewPanel>`. It reads `useReview` (the shared cache) and `useLedger`. The ledger query uses `['logics-ledger', id]`, `refetchInterval: pollInterval` and `keepPreviousData`, so polling stops in a hidden tab.
- Ledger chips: `queued` muted, `sending` info with a `Loader2` spinner, `sent` success with `#CaseDocumentID` (or `Confirmed by staff`), `failed` destructive with `error_detail` plus either the re-upload instruction or `Re-send`, and `unknown` as a `Needs your decision` button. Split parts show `part k of n` in `part_index` order. One muted `Simulated` badge appears per fake-mode document.
- Duplicate guard in the UI: a `sent`/`unknown` file shows `Already pushed`, and its checkbox stays disabled until `Push again` is ticked. Ticked files are sent in `push_again`.
- `PushSheet`: files with size and plan. HEIC and other `manual` files show `Won't be sent` and are left out of `document_ids`. It previews `Uploaded via ResSpark by {agent} — {file}` and `Documents uploaded via ResSpark by {agent}: …` (with `IDs are added automatically.`). The button reads `Push N files` / `Pushing…`. On success it toasts `Push started`. Refusals stay in place: the Worker's message for `logics_write_blocked`, `PUSH_ERROR_COPY` for the other codes.
- `ResolveUnknownDialog` offers `I checked Logics — it's there` (optional numeric `CaseDocumentID`, `Marks this file as sent.`), `Re-send` (`Re-send may create a duplicate in Logics if the first upload did arrive.`), and `Cancel`, which has initial focus. There is no retry-all and no auto-retry, and mutations never retry.
- **Deploy:** one `pnpm -C app run deploy` produced version `4f98194e-4d91-45d0-80b1-6e77f31dc916` with `LOGICS_MODE=fake` and `LOGICS_WRITE_ENABLED=false`. `GET /api/config` returns `logics_mode: "fake"`, the ledger route answers 401 without a token, and the served chunks contain `Logics writes simulated` and `Nothing approved yet`.

## Final banner strings

| Config | Banner |
|--------|--------|
| `logics_mode: 'fake'` (not production) | `SANDBOX · Logics writes simulated` |
| `logics_mode: 'live'` (not production) | `SANDBOX · Test environment — Logics writes go to allowlisted test cases only` |
| loading, error, or an unknown `logics_mode` | `SANDBOX Test environment — nothing here is sent to IRS Logics.` (the Phase 1 fail-safe) |
| `app_env: 'production'` | no banner |

## Task Commits

1. **Task 1: push card, plan, ledger hooks, push badge tones, request-page mount**: `55bfd74` (feat)
2. **Task 2: confirmation sheet, resolution dialog, fake-mode banner, `logics_mode`**: `9045cb5` (feat)

`commits: 19` is the measured `rev-list` count from `plan_head_before` on the shared `zack` tree. It includes 17 commits by the parallel executors (03-05, 04-03, 05-03, 06-01). This plan made 2 task commits plus the docs commit.

## Decisions Made

See `key-decisions` in the frontmatter. `sizeLabel` is **defined in `plan.ts`**, because `document-row.tsx` does not export its formatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `lib/api.test.ts` config fixture gained `logics_mode`**
- **Found during:** Task 2
- **Issue:** `isConfig` now requires `logics_mode`, so the existing fixture without it would fail the guard.
- **Fix:** added `logics_mode: 'fake'` to the fixture. The `production` banner test fixture got the same addition; without it the guard fails and the banner would show.
- **Files modified:** `app/src/lib/api.test.ts`, `app/src/features/layout/sandbox-banner.test.tsx`
- **Committed in:** `9045cb5`

**2. [Interface adaptation] `StatusBadge` API**
- **Issue:** the plan assumed `StatusBadge({ status })` with `KnownStatus`/`statusLabel`. The house component takes `{ tone, label }`, and its status maps live in `lib/status.ts`.
- **Fix:** added `PushState`, a `PUSH` map, and `PushStatusBadge({ state, label? })` to `status-badge.tsx`, plus an optional `icon` prop on `StatusBadge`. `lib/status.ts` was not touched.
- **Committed in:** `55bfd74`

**3. [Interface adaptation] hook signatures take `caseId`**
- `useCreatePush(requestId, caseId)` and `useResolvePush(requestId, caseId)` take `caseId` because the plan's `['events', caseId]` invalidation needs it. `PushSheet` and `ResolveUnknownDialog` take `caseId` as well.

**Total deviations:** 1 auto-fixed (blocking) and 2 interface adaptations. No scope creep, and no UI-SPEC deviation.

## Issues Encountered

- During the whole-tree gate, `tsc -b` first failed in files owned by other executors: `worker/test/admin-integrations.test.ts`, `admin-lookup.test.ts`, smarty and c-address tests. Their in-flight `FirmIntegrationRow.settings` and Smarty work caused it. After they landed, `tsc -b` passed. Then size gate, eslint (0 errors, 7 pre-existing warnings), and `pnpm test` (95 files, 1,210 passed) all passed before the deploy.
- `pnpm -C app run check` stops at the known pre-existing "golden.json is stale" step. The remaining steps were run by hand as instructed.
- The 03-05 executor's commit `f772420` also edited `request-page.tsx`. My one-line mount and import survived; the card now sits between `MirrorCard` and `Timeline`, still directly below `ReviewPanel`.

## Known Stubs

None.

## User Setup Required

None for this plan. The deployed Worker still refuses every push with `logics_write_blocked` while `LOGICS_WRITE_ENABLED=false`. The sheet shows that refusal as an in-place alert. Turning on fake-mode pushes on the deployed sandbox belongs to Plan 05-05.

## Next Phase Readiness

- Plan 05-05 (settings and live switch) can rely on the banner and the `(simulated)` labels reading `logics_mode`.
- Requirements PUSH-01, PUSH-02, and PUSH-04 were **not** marked complete here: 05-03 (PUSH-02, PUSH-04) and 05-05 (PUSH-01) still declare them and are unfinished.

## Self-Check: PASSED

---
*Phase: 05-push-to-logics*
*Completed: 2026-10-11*
