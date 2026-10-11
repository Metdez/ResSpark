---
phase: 03-uploads-review-live-status
plan: 04
subsystem: ui
tags: [tanstack-table, tanstack-query, tanstack-router, hono, postgrest, polling, dashboard]
requires:
  - phase: 03-uploads-review-live-status
    provides: "request_dashboard_v (03-01); requestStatusBadge, OVERDUE_BADGE, pollInterval, ago (03-06)"
  - phase: 02-find-the-client-send-the-link
    provides: "GET /api/admin/requests list handler and /admin/requests page (02-04, 02-06); meta.errorShown convention (02-08)"
provides:
  - "GET /api/admin/requests?status=&q= over request_dashboard_v: firm-scoped, non-draft by default, last_activity_at DESC NULLS LAST, id DESC, 200 cap"
  - "db/dashboard.ts: listDashboardRequests, DASHBOARD_STATUSES, sanitizeQuery, clientName (the one display-name rule)"
  - "/admin dashboard: status chips, debounced search, sortable TanStack Table, Overdue badge, 5 s visibility-aware poll"
  - "useRequests({ status, q }) keyed ['requests', status, q]"
affects: [03-03 approve/reject (should invalidate ['requests']), 03-05, 05 Logics push, phase 3 verification]
actuals:
  tokens: 15000
  tasks: 2
  commits: 24
plan_head_before: 0fb51e86f8739801381a231406e1e3409092dd08
plan_head_after: e4721c05c046d1f96a4032468527da1ed2710616
tech-stack:
  added: []
  patterns:
    - "One list handler per path: the Phase 2 GET / body was replaced, not shadowed by a new route file"
    - "Untrusted text spliced into a PostgREST or(...) filter goes through an allowlist sanitizer first"
    - "Dashboard filter state lives in the route search params (validateSearch with .catch(undefined))"
key-files:
  created:
    - app/worker/src/db/dashboard.ts
    - app/worker/src/db/dashboard.test.ts
    - app/src/features/dashboard/api.ts
    - app/src/features/dashboard/api.test.ts
    - app/src/features/dashboard/columns.tsx
    - app/src/features/dashboard/filters.tsx
    - app/src/features/dashboard/use-requests.ts
    - app/src/features/dashboard/use-requests.test.ts
    - app/src/features/dashboard/request-table.tsx
    - app/src/features/dashboard/request-table.test.tsx
    - docs/app/worker/src/db/dashboard.md
    - docs/app/worker/src/db/dashboard.test.md
    - docs/app/src/features/dashboard/{api,columns,filters,use-requests,request-table}.md
    - docs/app/src/features/dashboard/{api,use-requests,request-table}.test.md
  modified:
    - app/worker/src/routes/admin-requests.ts
    - app/worker/src/db/requests.ts
    - app/worker/test/admin-requests.test.ts
    - app/worker/test/admin-request-actions.test.ts
    - app/src/features/dashboard/index.tsx
    - app/src/routes/admin/_shell/index.tsx
    - docs/app/worker/src/routes/admin-requests.md
    - docs/app/worker/src/db/requests.md
    - docs/app/worker/test/admin-requests.test.md
    - docs/app/src/features/dashboard/index.md
    - docs/app/src/routes/admin/_shell/index.md
    - docs/app/src/features/requests/requests-list-page.md
key-decisions:
  - "Timestamp columns sort with TanStack's 'text' sortingFn, not 'alphanumeric': PostgREST ISO strings with different fractional-second lengths compare chronologically as text but not alphanumerically"
  - "?status=draft is refused with 400 like any unknown status; the route search schema uses .catch(undefined) so a bad hand-edited URL shows the unfiltered list instead of an error page"
  - "A status-chip-only empty result says 'No requests are <status>' with no CTA, instead of the zero-requests 'No requests yet' block"
patterns-established:
  - "Dashboard queries: ['requests', status ?? 'all', q ?? ''] + refetchInterval: pollInterval + keepPreviousData + meta.errorShown"
requirements-completed: [STAT-01, STAT-02]
coverage:
  - id: D1
    description: "GET /api/admin/requests validates ?status=, sanitizes ?q=, reads request_dashboard_v firm-scoped; Phase 2 keys kept; listRequests/RequestListRow removed"
    requirement: STAT-01
    verification:
      - kind: unit
        ref: "app/worker/src/db/dashboard.test.ts"
        status: pass
      - kind: integration
        ref: "app/worker/test/admin-requests.test.ts#GET /api/admin/requests (dashboard list)"
        status: pass
      - kind: unit
        ref: "app/src/features/requests/requests-list-page.test.tsx"
        status: pass
      - kind: other
        ref: "node app/scripts/db-migrate.mjs --query (request_dashboard_v has expires_at, created_at, last_activity_at, overdue: n=4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dashboard table: chips, debounced URL search, sortable columns, status + Overdue badges, skeleton/empty/error/retrying states, count line"
    requirement: STAT-01
    verification:
      - kind: unit
        ref: "app/src/features/dashboard/request-table.test.tsx"
        status: pass
      - kind: unit
        ref: "app/src/features/dashboard/api.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "5 s visibility-aware polling with keyed queries and keepPreviousData"
    requirement: STAT-02
    verification:
      - kind: unit
        ref: "app/src/features/dashboard/use-requests.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live flip to Complete within 10 s of approve, hidden tab pauses polling, filter survives reload, /admin/requests unchanged in the browser"
    requirement: STAT-02
    verification: []
    human_judgment: true
    rationale: "Plan human-check: multi-tab browser behaviour, Network-tab inspection and the approve action from Plan 03-03; no staff browser session was available to this executor"
duration: 3h06m wall (two session restarts; roughly 60 min of active work)
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 04: Live Request Dashboard Summary

**`/admin` is now a live request list. Phase 2's single `GET /api/admin/requests` handler reads `request_dashboard_v` and accepts a validated `?status=` and an allowlist-sanitized `?q=`. On top of it sits a TanStack Table with status chips, a debounced search kept in the URL, sortable relative-time columns, an Overdue badge, and a 5 s poll that pauses when the tab is hidden. The app was deployed as version `55a555f7`.**

## Performance

- **Duration:** 3h06m wall clock, 2026-10-11T09:39:28Z to 12:45:24Z. That includes two Claude Code session restarts and the shared-tree waits; active work was about an hour.
- **Tasks:** 2 (both TDD: a RED commit, then a GREEN commit)
- **Files:** 35 touched (20 created, 15 modified), counting docs

## Accomplishments

- **One list endpoint.** I replaced only the body of Phase 2's `GET /` in `routes/admin-requests.ts`. It now does four things:
  - Checks `status` against `DASHBOARD_STATUSES` and returns 400 `bad_request` otherwise. `draft` is refused too.
  - Runs `q` through `sanitizeQuery`, which keeps only `[A-Za-z0-9@._'\- ]`, collapses spaces, and caps it at 64 characters.
  - Calls `listDashboardRequests(env, staff.firmId, …)`.
  - Returns `{ requests }`. Every row still has the Phase 2 keys (`id, status, client_name, sent_at, expires_at, created_at`), so `/admin/requests`, `requests-api.ts` and `requests-list-page.tsx` work without any change.

  `GET /templates`, `POST /`, `GET /:id`, the `expires_at` check in `linkUrl`, and `index.ts` were not touched. `grep -c "get('/',"` prints 1.
- **Old reader removed.** `listRequests`, `RequestListRow` and the `ListRaw`/`OneOrMany`/`one` helpers are gone from `db/requests.ts`, along with their mock entries in both Phase 2 test files. `grep -rn "listRequests\|RequestListRow" app/worker/src` prints nothing. The display-name rule now lives in one place, `clientName`: first and last name, then email, then `Unknown client`.
- **Dashboard UI.** It reuses the vendored data-table part `DataTableColumnHeader` (an Asc/Desc menu on each sortable header) plus the shadcn `Table`, `Skeleton`, `Alert`, `Card`, `Button`, `Input`, `DropdownMenu` and `Tooltip`. Badges come only from `requestStatusBadge`/`OVERDUE_BADGE` through the unchanged `StatusBadge`, and times only from `ago()`.
- **Polling.** The query key is `['requests', status ?? 'all', q ?? '']`, with `refetchInterval: pollInterval` (5 s, 30 s after an error), `keepPreviousData`, and `refetchIntervalInBackground` left at its default `false`. There is no Realtime, WebSocket or SSE.
- **Deployed** after `pnpm -C app run check` passed on the whole tree: 72 test files passed, 997 tests passed, 0 lint errors, and file sizes OK. Smoke with `--auth` passed every check. On the live deployment `/api/admin/requests` returns 401 without a token, and `/admin?status=complete` returns 200.

## Task Commits

1. **Task 1 RED:** `43c28ac` (test). Sanitizer and client-name unit tests, plus route cases for status and q.
2. **Task 1 GREEN:** `b23d367` (feat). `db/dashboard.ts`, the new `GET /` body, the old reader removed, and 6 docs.
3. **Task 2 RED:** `087682b` (test). Tests for the table and filters, the polling hook, and the API guard.
4. **Task 2 GREEN:** `716720c` (feat). `api.ts`, `use-requests.ts`, `columns.tsx`, `filters.tsx`, `request-table.tsx`, `index.tsx`, the route `validateSearch`, and docs.
5. **Docs:** `31c5859`. Companion docs for the three dashboard test files.
6. **Fix:** `32afe29`. Typing problems surfaced by `tsc -b` (see Deviations).

`commits: 24` is the measured `rev-list` count from `plan_head_before` on the shared `zack` branch. It includes 18 commits from the concurrent executors (03-02, 03-03, 04-02, 05-01). This plan made the 6 commits above.

## RED evidence

- **Task 1:** `dashboard.test.ts` and `admin-requests.test.ts` both failed with `Cannot find module './dashboard'`. The 22 tests that existed before still passed.
- **Task 2:** all three new dashboard test files failed to resolve `./api` or `./use-requests`, because those modules did not exist yet.

## Answers the plan asked for

- **Phase 2 handler:** the body of `GET /` was replaced. Fields kept for `requests-list-page.tsx`: `id, status, client_name, sent_at, expires_at, created_at`. The page's own test still passes (6/6). Two things change on that page: drafts are no longer listed, and rows are ordered by latest activity instead of `created_at`.
- **Removed:** `listRequests` and `RequestListRow`, plus the private `ListRaw`, `OneOrMany` and `one` that only that reader used.
- **Data-table parts reused:** `DataTableColumnHeader`. `DataTablePagination` was not needed, because the server caps the list at 200 rows.
- **Human-check timings** (click to badge flip): not measured. It needs Plan 03-03's approve action in a staff browser session. It is recorded below as an end-of-phase check.
- **Probe rows:** the live list query for ValorTax currently returns 0 rows. The "Live Probe" case 999999001 has no lasting requests, because smoke and `requests-live` delete theirs. The test firm `…000e` is a different firm and is excluded by `.eq('firm_id', …)`. A smoke run in progress can show its probe request for a few seconds; that is acceptable for the demo.
- **PostgREST `or(...)`:** I ran it live with `live.probe@example.com`, `O'Neil`, `Ann Smith ann@x.com` and `mary-jo_s`. All four parsed without an error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Sorting by ISO time used `'text'`, not `'alphanumeric'`**
- **Found during:** Task 2
- **Issue:** The plan specified `sortingFn: 'alphanumeric'`. That function splits strings into numeric chunks, so `…:00.5+00:00` and `…:00.123+00:00` compare `5 < 123` and come out in the wrong order. PostgREST trims trailing zeros from fractional seconds, so fractions of different lengths do happen.
- **Fix:** Used `sortingFn: 'text'`. A plain string comparison of ISO strings is chronological.
- **Files modified:** `app/src/features/dashboard/columns.tsx`
- **Commit:** `716720c`

**2. [Rule 3 - Blocking] Type errors that only `tsc -b` caught**
- **Found during:** the full check before deploy
- **Issue:** `useNavigate({ from })` takes the route's fullPath (`/admin/`), not its id (`/admin/_shell/`). The tests also used `Array.prototype.at`, which the project's `lib` setting does not include.
- **Fix:** Changed `from: '/admin/'` and switched the tests to `mock.lastCall`.
- **Files modified:** `filters.tsx`, `request-table.test.tsx`, `use-requests.test.ts`
- **Commit:** `32afe29`

**3. [Rule 2 - Missing critical] An empty result from a status chip gets its own copy**
- **Found during:** Task 2
- **Issue:** The plan only covered two empty cases: no filter, and `q`. With only a chip selected and no rows, the page would have said `No requests yet` and offered a `Look up a client` CTA, which is wrong when the firm does have requests.
- **Fix:** It now shows `No requests are <status label>` and `Try another filter or search.`, with no CTA.
- **Commit:** `716720c`

**4. [Scope] `admin-request-actions.test.ts` lost its `listRequests` mock entry**
- **Reason:** It mocked a function that no longer exists. Only the one line was removed.
- **Commit:** `43c28ac`

**5. [Scope] Extra test files `api.test.ts` and `use-requests.test.ts`**
- **Reason:** The plan asserted the `useQuery` options inside `request-table.test.tsx`. That file mocks `useRequests` so it can control the states, so the options assertion moved into its own small test file. The response guard got its own file for the same reason.

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 missing critical) and 2 scope notes.
**Impact on plan:** None of these change behaviour beyond the plan's stated truths.

## Issues Encountered

- During the first full check, `request-builder.test.tsx` (Phase 2, not my file) failed twice with `waitFor timed out`. Four executors were running suites at the same time, and that harness's 2 s first-render wait ran out. It passed when run alone, and the full check that followed was green with 0 failed.
- The session restarted twice during Task 2. Nothing was lost, because Task 1 and the Task 2 RED tests were already committed.
- Lint warnings that remain are 0 errors. `react-refresh/only-export-components` fires on `filters.tsx`, because the plan requires `STATUS_CHIPS` to be exported from that file. `react-hooks/incompatible-library` fires on `useReactTable`, which is expected for TanStack Table.

## Known Stubs

None.

## Next Phase Readiness

- Plan 03-03's approve and reject mutations should call `invalidateQueries({ queryKey: ['requests'] })`, so the dashboard updates straight away instead of on the next 5 s tick. Plan 03-03 owns that file, so I did not check it.
- **End-of-phase human check**, which still needs to be run:
  1. Open `/admin` in one tab and the request page in another. Approve the last required item; the badge should turn `Complete` within 10 s.
  2. Leave the dashboard tab hidden for 30 s. The Network tab should show no requests, then one when the tab comes back.
  3. Filter by `Complete` and reload; the filter should stay.
  4. Search for a name that does not exist; the page should show `No requests match`.
  5. Open `/admin/requests`; it should still list the same requests.

## Self-Check: PASSED

- All created files exist on disk, and commits `43c28ac`, `b23d367`, `087682b`, `716720c`, `31c5859` and `32afe29` are ancestors of HEAD.
- All acceptance greps for Task 1 and Task 2 passed.
- `pnpm -C app run check` exited 0.
- Worker tests: 61/61. Dashboard and list-page web tests: 21/21. The live view has all 4 columns.
