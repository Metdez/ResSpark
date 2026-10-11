---
phase: 03-uploads-review-live-status
plan: 06
subsystem: ui
tags: [react, tanstack-query, vitest, status-badge, polling, relative-time]

requires:
  - phase: 02-find-the-client-send-the-link
    provides: "lib/status.ts maps + StatusBadge (02-05), requests list page with in-file relativeTime (02-06), client portal step list (02-08)"
provides:
  - "documentStatusBadge(status) and OVERDUE_BADGE in lib/status.ts"
  - "client itemStatusBadge('submitted') -> warning 'With your agent'"
  - "pollInterval for TanStack Query refetchInterval (5 s, 30 s after error)"
  - "ago(iso, now?) and minutesSince(iso, now?) in lib/relative-time.ts, the single relative-time helper"
affects: [03-02, 03-03, 03-04, 03-05]

actuals:
  tokens: 6800
  tasks: 2
  commits: 10

plan_head_before: 7d857d2cde3ac27a5e87d1b08d002c9a1313318e
plan_head_after: cb3f73a54502abbe55530eb03c808571d9a56eb7

tech-stack:
  added: []
  patterns:
    - "Every status label (request, item, document, Overdue) comes from lib/status.ts and renders through the unchanged Phase 2 StatusBadge"
    - "Live queries pass refetchInterval: pollInterval and leave refetchIntervalInBackground at false"
    - "Rendered timestamps use ago(iso) with the ISO in title"

key-files:
  created:
    - app/src/lib/polling.ts
    - app/src/lib/polling.test.ts
    - app/src/lib/relative-time.ts
    - app/src/lib/relative-time.test.ts
    - docs/app/src/lib/polling.md
    - docs/app/src/lib/relative-time.md
  modified:
    - app/src/lib/status.ts
    - app/src/lib/status.test.ts
    - app/src/features/client-portal/portal-page.test.tsx
    - app/src/features/requests/requests-list-page.tsx
    - app/src/features/requests/requests-list-page.test.tsx
    - docs/app/src/lib/status.md
    - docs/app/src/features/requests/requests-list-page.md
    - docs/app/src/features/client-portal/step-list.md

key-decisions:
  - "ago() also formats future times as 'in N d' because the requests list Expires column shows a future date; past-only arithmetic would have rendered it as 'just now'"
  - "ago() rounds within the chosen unit (as Phase 2's helper did); minutesSince() floors as the plan specifies"
  - "OVERDUE_BADGE is declared `as const`, so it type-checks as { tone: 'destructive'; label: 'Overdue' } and spreads into StatusBadge"

patterns-established:
  - "Status labels: one module (lib/status.ts) and one badge (components/status-badge.tsx)"
  - "Polling: refetchInterval: pollInterval"
  - "Relative time: ago() from @/lib/relative-time, never a page-local helper"

requirements-completed: [UPL-03, STAT-01, STAT-02]

coverage:
  - id: D1
    description: "lib/status.ts extended: documentStatusBadge, OVERDUE_BADGE, client submitted -> With your agent; all Phase 2 labels unchanged"
    requirement: UPL-03
    verification:
      - kind: unit
        ref: "app/src/lib/status.test.ts"
        status: pass
      - kind: unit
        ref: "app/src/features/client-portal/portal-page.test.tsx#renders 44 px rows with description, client chip and a 44 px View, never below 16 px"
        status: pass
    human_judgment: false
  - id: D2
    description: "StatusBadge byte-identical to Phase 2; every Phase 2 consumer test and the build pass"
    verification:
      - kind: other
        ref: "git diff --quiet HEAD -- app/src/components/status-badge.tsx"
        status: pass
      - kind: unit
        ref: "pnpm -C app exec vitest run --project web src/lib src/features/requests src/features/lookup src/features/client-portal"
        status: pass
    human_judgment: false
  - id: D3
    description: "pollInterval: 5000 unless the query is in error, then 30000"
    requirement: STAT-02
    verification:
      - kind: unit
        ref: "app/src/lib/polling.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "ago/minutesSince in lib/relative-time.ts; requests list uses ago and has no local helper"
    requirement: STAT-01
    verification:
      - kind: unit
        ref: "app/src/lib/relative-time.test.ts"
        status: pass
      - kind: unit
        ref: "app/src/features/requests/requests-list-page.test.tsx#shows relative times with the ISO timestamp in title"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 06: Shared status, polling and relative-time atoms Summary

**`lib/status.ts` gained `documentStatusBadge`, `OVERDUE_BADGE` and the client `With your agent` label, with `StatusBadge` left as Phase 2 shipped it. `pollInterval` (5 s, or 30 s after an error) and `ago()`/`minutesSince()` were added. The requests list now uses `ago()` instead of its own `Intl.RelativeTimeFormat` helper.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-11T09:18:30Z
- **Completed:** 2026-10-11T09:31:29Z
- **Tasks:** 2 (both TDD: RED commit, then GREEN commit)
- **Files modified:** 14 (6 created, 8 modified)

## Accomplishments

- `lib/status.ts` is the only source of status labels Phase 3 needs. It covers requests, items for both audiences, documents, and the `Overdue` flag. All of them render through the unchanged Phase 2 `StatusBadge`.
- A client's `submitted` step now reads `With your agent` (warning). Every other Phase 2 label is unchanged.
- `pollInterval` is ready for Plans 03-02 to 03-05 to pass as `refetchInterval`.
- The admin app has exactly one relative-time helper: `ago()` in `lib/relative-time.ts`.

## Task Commits

1. **Task 1 RED:** `9a26c16` (test). Document statuses, Overdue, client `With your agent`, and the portal chip assertion.
2. **Task 1 GREEN:** `1b00dde` (feat). `documentStatusBadge`, `OVERDUE_BADGE`, the client label, and the status and step-list docs.
3. **Task 2 RED:** `78de491` (test). `pollInterval`, `ago`, `minutesSince`, and the list page's short times.
4. **Task 2 GREEN:** `38492b4` (feat). `polling.ts`, `relative-time.ts`, the list page swap, and docs. This commit also picked up another executor's staged files; see Issues Encountered.

`commits: 10` is the measured `rev-list` count from `plan_head_before` to `plan_head_after` on the shared `zack` branch. It includes 6 commits from concurrent work (04-01, and the Phase 2 verification docs). This plan made the 4 commits above.

## RED evidence

- **Task 1:** target `src/lib/status.test.ts > itemStatusBadge > tells a client who uploaded that the item is with their agent`. It failed with `expected 'In progress' to be 'With your agent'`, and `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK`. Semantic check: the target ran and failed on the planned label assertion.
- **Task 2:** target `src/features/requests/requests-list-page.test.tsx > RequestsListPage > shows relative times with the ISO timestamp in title`. It failed with `expected '2 hours ago' to be '2 h ago'` and returned `RED_EVIDENCE_OK`. The new `polling.test.ts` and `relative-time.test.ts` also failed, because their modules did not exist yet.

## Answers the plan asked for

- **Which Phase 2 client test held the `submitted` chip assertion:** `app/src/features/client-portal/portal-page.test.tsx`, in the case "renders 44 px rows with description, client chip and a 44 px View, never below 16 px". The 4th row is step 4, `upload`, `submitted`. Its expected chip changed from `In progress` to `With your agent`. `step-list.test.tsx` had no such assertion.
- **Did Phase 2's `relativeTime` use `Intl.RelativeTimeFormat`?** Yes. It used `new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })` with a year-to-second unit table, and it was removed. The page test strings changed from `2 hours ago` to `2 h ago` and from `in 13 days` to `in 13 d`. The helper's own unit test (`30 seconds ago`, `45 minutes ago`, `yesterday`, `in 13 days`, `2 months ago`) was removed from the page test. `relative-time.test.ts` replaces it.
- **Final export list of `lib/status.ts`:** `Tone`, `TONE_CLASSES`, `OVERDUE_BADGE`, `requestStatusBadge`, `itemStatusBadge`, `documentStatusBadge`.

## Files Created/Modified

- `app/src/lib/status.ts`: the client `submitted` label, the `DOCUMENT` map, `OVERDUE_BADGE`, and `documentStatusBadge`.
- `app/src/lib/polling.ts`: `pollInterval`.
- `app/src/lib/relative-time.ts`: `ago` and `minutesSince`.
- `app/src/features/requests/requests-list-page.tsx`: imports `ago` and drops its local helper.
- Tests: `status.test.ts`, `polling.test.ts`, `relative-time.test.ts`, `requests-list-page.test.tsx`, and `portal-page.test.tsx` (one string).
- Docs: `docs/app/src/lib/{status,polling,relative-time}.md`, `docs/app/src/features/requests/requests-list-page.md`, and `docs/app/src/features/client-portal/step-list.md`.

## Decisions Made

- `ago()` formats future times as `in N d`. The plan's contract lists only past forms, but the `Expires` column always shows a future date. Without this it would have read `just now`.
- `ago()` rounds within the largest unit the gap reaches, as the Phase 2 helper did. This keeps `in 13 d` stable while a test runs a few milliseconds later. `minutesSince()` floors, as specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `ago()` handles future timestamps**
- **Found during:** Task 2
- **Issue:** The plan's `ago` contract is past-only, but the requests list renders `expires_at`, which is in the future. Past-only arithmetic would show `just now`.
- **Fix:** A negative gap renders `in N min|h|d`. Added a test case (`-13 d` gives `in 13 d`).
- **Files modified:** `app/src/lib/relative-time.ts`, `app/src/lib/relative-time.test.ts`
- **Commit:** `78de491`, `38492b4`

**2. [Rule 2 - Docs sync] `step-list.md` updated**
- **Found during:** Task 1
- **Issue:** `docs/app/src/features/client-portal/step-list.md` still said `submitted` shows `In progress`. The project rule requires companion docs to stay in sync.
- **Fix:** One-line wording change.
- **Commit:** `1b00dde`

**3. [Test shape] Added a single-line target assertion for RED**
- **Found during:** Task 1 RED
- **Issue:** Vitest's TAP output for a failed object `toEqual` prints multi-line YAML strings, and the RED classifier rejected that as `invalid_record`.
- **Fix:** Added a separate case, `tells a client who uploaded that the item is with their agent`, which asserts `.label` with `toBe`. It was used as the RED target. The `it.each` table entry for the full object stays.
- **Commit:** `9a26c16`

**Total deviations:** 3 (1 bug, 1 docs sync, 1 test shape). **Impact:** no scope creep. `StatusBadge` and `TONE_CLASSES` are untouched.

## Issues Encountered

- **Shared index sweep:** commit `38492b4` (Task 2 GREEN) also contains `app/worker/src/routes/admin-requests.ts`, `app/worker/test/admin-requests.test.ts` and `docs/app/worker/src/routes/admin-requests.md`. These are another executor's expired-link fix, which was already staged in the shared index when this executor ran `git add <own paths> && git commit`. That executor recorded it afterwards in `cb3f73a` ("landed in 38492b4 via shared-index sweep"). Later commits sit on top on a shared branch, so history was not rewritten. Lesson: on a shared index, `git commit -- <paths>` commits only the named paths.
- The plan does not wire `pollInterval` into any page. Plans 03-02 to 03-05 do that, and 03-04 keeps `requests-list-page.tsx` untouched, so this plan did not add polling to the list page.

## Verification

- `vitest --project web src/lib src/features/requests src/features/lookup src/features/client-portal`: 20 files and 189 tests passed.
- `pnpm -C app build`: passed (Task 1). `git diff --quiet HEAD -- app/src/components/status-badge.tsx`: exit 0.
- `node app/scripts/check-file-sizes.mjs`: passed.
- `pnpm -C app run check` on the whole tree: exit 0. 55 files and 843 tests passed, 10 files and 105 tests skipped. ESLint reported 0 errors and 5 warnings, none in this plan's files.

## User Setup Required

None.

## Next Phase Readiness

- Plans 03-02 and 03-03 can import `documentStatusBadge`, `OVERDUE_BADGE`, `pollInterval`, and `ago` without editing `lib/status.ts`.
- `UPL-03`, `STAT-01` and `STAT-02` stay open in REQUIREMENTS.md: `requirements.ready-ids` reported 0/3 ready because later plans in this phase also declare them.

## Self-Check: PASSED

- All six created files exist on disk.
- Commits `9a26c16`, `1b00dde`, `78de491` and `38492b4` are ancestors of HEAD.
- Every task acceptance criterion was re-run and passed.

---
*Phase: 03-uploads-review-live-status*
*Completed: 2026-10-11*
