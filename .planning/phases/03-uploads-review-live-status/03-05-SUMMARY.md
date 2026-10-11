---
phase: 03-uploads-review-live-status
plan: 05
subsystem: ui
tags: [react, tanstack-query, vitest, timeline, events, heartbeat, status-badge]
status: complete

requires:
  - phase: 03-uploads-review-live-status
    provides: "GET /api/admin/cases/:id/events (03-03), /review with client_session (03-03), review panel on the request page (03-03), pollInterval/ago/minutesSince (03-06)"
  - phase: 02-find-the-client-send-the-link
    provides: "client_sessions heartbeat with last_step/last_error (02-07, 02-08), StatusBadge + Tone (02-05)"
provides:
  - "actionLabel(action, payload) and ACTION_LABELS in features/timeline/labels.ts, with a words fallback for unknown actions"
  - "fetchEvents(caseId, before?) with isEventsResponse guard"
  - "ActorBadge({ actorType }) on the shared StatusBadge tones"
  - "Timeline({ caseId }): newest-first event list, first page polled, Load older 50 at a time"
  - "mirrorState() and MirrorCard({ requestId }): client step, last seen, last error, >10 min stuck hint"
  - "ReviewRequest.opened_at on the SPA review contract"
affects: [04-truv-plaid, 05-logics-push, 08-reminders]

actuals:
  tokens: 8700
  tasks: 2
  commits: 12

plan_head_before: 80b0ac9a10ff77b63f4998857f9de8f863b9dc32
plan_head_after: f30c23b27832c53acf41fe04a92c45bac13112f7

tech-stack:
  added: []
  patterns:
    - "Polled first page via useQuery plus on-demand older pages in local state (no useInfiniteQuery, so refetchInterval never refetches old pages)"
    - "Event sentences live in one table (labels.ts); unknown actions render as words, so new event writers need no UI change"

key-files:
  created:
    - app/src/features/timeline/labels.ts
    - app/src/features/timeline/labels.test.ts
    - app/src/features/timeline/api.ts
    - app/src/features/timeline/actor-badge.tsx
    - app/src/features/timeline/timeline.tsx
    - app/src/features/timeline/timeline.test.tsx
    - app/src/features/review/mirror-card.tsx
    - app/src/features/review/mirror-card.test.tsx
    - docs/app/src/features/timeline/labels.md
    - docs/app/src/features/timeline/api.md
    - docs/app/src/features/timeline/actor-badge.md
    - docs/app/src/features/timeline/timeline.md
    - docs/app/src/features/review/mirror-card.md
  modified:
    - app/src/features/requests/request-page.tsx
    - app/src/features/requests/request-page.test.tsx
    - app/src/features/review/api.ts
    - app/src/features/review/review-panel.test.tsx
    - docs/app/src/features/requests/request-page.md
    - docs/app/src/features/review/api.md

key-decisions:
  - "Timeline paging snapshots the live first page on the first Load older click, so rows a later poll pushes off page 1 stay listed (no gap); the list is deduped by id"
  - "Event label keys follow what the Worker actually writes (request.email_sent, not the plan's request.emailed), plus request.created/revoked/link_regenerated"
  - "Mirror card maps heartbeat step 'intro' to 'the welcome screen' and never shows the stuck hint before opened_at is set"
  - "MirrorCard and Timeline mount only in the request page's non-draft branch: mirror above ReviewPanel, Timeline last (below 05-04's LogicsPushCard)"

requirements-completed: [STAT-03, STAT-04]

duration: 30min
completed: 2026-10-11
---

# Phase 3 Plan 05: Client Mirror and Case Timeline Summary

**A "Client view" card showing the client's current step, when they were last seen, their last error and a red `Client may be stuck` hint after 10 quiet minutes, plus a newest-first case timeline with actor badges, plain-language labels and `Load older` paging, both on the request page.**

## Performance

- **Duration:** about 30 min (09:57 to 10:27 EDT)
- **Tasks:** 2 of 2
- **Files:** 13 created, 6 modified

## Accomplishments

- `labels.ts`: one sentence per known action. Unknown actions (provider webhooks, `logics.*`, `job.*`) render as their own name with dots and underscores turned into spaces. Payload values are read only when they are strings.
- `mirror-card.tsx`: `mirrorState` covers not opened, opened with no session, and active. Stuck means `seen_at` more than 10 minutes old, the link opened, and the request not `complete` or `revoked`. The card reads the review panel's `['review', id]` query, so it adds no request and refreshes on the same 5 s poll. It shows only the step words and the mapped error copy. It never shows `user_agent_class`, the IP address or `actor_id`.
- `timeline.tsx`: the first page polls through `useQuery(['events', caseId])` with `pollInterval`. Older pages load only when the user clicks `Load older`; they are kept in state and never re-polled. The card has skeleton, empty (`No activity yet`) and error-with-retry states. Approve and reject already invalidate `['events', caseId]` (03-03), so a decision appears at once.
- `actor-badge.tsx`: Staff/Client/System/Provider labels on the shared `info`/`success`/`neutral`/`warning` tones. The file has no colour classes of its own.

## Plan output records

- **Heartbeat `last_step` format observed (02-08, `portal-page.tsx`):** `opened ? (viewed ?? 'list') : 'intro'`, where `viewed` is the step kind the client tapped (`upload`, `bank_connect`, `payroll_connect`, `address`, `signature`, `intake`). `last_error` is `'state_failed' | 'start_failed' | undefined`. The heartbeat sends once on load and then every 30 s while the tab is visible. The Worker caps `last_step` at 64 characters.
- **Action names found by grep** (`app/worker/src` + `supabase/migrations`): `staff.signed_in`, `staff.signed_out`, `case.looked_up`, `request.created`, `request.sent`, `request.link_copied`, `request.email_sent`, `request.email_failed`, `request.link_regenerated`, `request.revoked`, `request.opened`, `consent.sms`, `document.uploaded` (payload `mime_type`), `document.viewed` (payload `disposition`), `item.approved`, `item.rejected` (payload `label`, `note`), `integration.logics.tested`, `connection.refresh_requested`, `webhook.rejected`, `logics.push_queued/_sending/_resolved/_unknown`, `logics.activity_sent/_failed`, `job.failed`, `job.dead_lettered`. The plan expected `request.emailed`, but the Worker writes `request.email_sent`, so that is the key used.
- **Human-check outcomes:** none performed. This was an unattended `--auto` run and the plan has no checkpoint task. The end-of-phase checks are still open: the mirror shows a live step within 10 s, the stuck hint appears after 11 min, and the timeline order and labels read correctly on a real request.

## Task Commits

1. **Task 1: Labels and the mirror card** - `13a7284` (feat)
2. **Task 2: Timeline list, actor badges, Load older, request-page wiring** - `f772420` (feat)

`commits: 12` in the frontmatter is `git rev-list --count` from the ledger base. Four other executors were committing to `zack` at the same time, so this count includes their commits. This plan made 2 of them (`git log --oneline 80b0ac9..HEAD | grep -c "(03-05)"` returns 2, not counting this docs commit).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The SPA review contract had no `opened_at`**
- **Found during:** Task 1
- **Issue:** `mirrorState` needs `request.opened_at`. The Worker's `/review` already sends it, but the SPA's `ReviewRequest` type and the `isReviewResponse` guard did not declare it.
- **Fix:** added `opened_at: string | null` to `ReviewRequest`, added `strOrNull(v.request.opened_at)` to the guard, and updated the `review-panel.test.tsx` fixture and `docs/.../review/api.md`.
- **Commit:** `13a7284`

**2. [Rule 1 - Bug] Event ids are numbers, not strings**
- **Found during:** Task 2
- **Issue:** `events.id` is `BIGINT`, so PostgREST sends it as a JSON number (the Worker's `EventRow.id: number` agrees). A string guard would have rejected every real response.
- **Fix:** `EventRow.id: number` and `typeof v.id === 'number'`; dedupe uses a `Set<number>`.
- **Commit:** `f772420`

**3. [Rule 1 - Bug] Label keys match the event names the Worker writes**
- **Issue:** the plan listed `request.emailed`, but the Worker writes `request.email_sent`.
- **Fix:** mapped `request.email_sent` → `Emailed the link`. Also mapped `request.created`, `request.revoked` and `request.link_regenerated`, which the Phase 2 send flow writes on every request, so the default timeline does not show raw names.
- **Commit:** `13a7284`

**4. [Rule 1 - Bug] Paging gap when a poll lands between clicks**
- **Issue:** if `Load older` used the cursor from page 1 as it was first loaded, any row a later poll pushed off page 1 would disappear.
- **Fix:** the first click takes its cursor from the live first page and snapshots that page's rows into `older`. Rows are deduped by `id`.
- **Commit:** `f772420`

**5. [Rule 1 - Bug] Heartbeat `intro` step**
- **Issue:** the portal sends `intro` before the client taps Start. The plan's rule would show `Client is on: intro` and could flag a client as stuck before the link was opened.
- **Fix:** `intro` reads `the welcome screen`, and `stuck` requires `opened_at`.
- **Commit:** `13a7284`

**Placement note:** 05-04 had already committed `<LogicsPushCard>` below `<ReviewPanel>`. `<Timeline>` therefore sits after the push card, which is still below the review panel. Neither component mounts for a draft request. `request-page.test.tsx` gained a pending `/api/admin/cases/c1/events` stub and two assertions. There were no foreign hunks in any shared file at commit time.

## Deferred Issues

- **Equal `created_at` at a page edge (STAT-04 edge truth only partly met).** The Worker's events cursor is `created_at` only (the accepted 03-03 shortcut in `worker/src/db/review.ts`). Two cases can skip rows: events written in one transaction share `CURRENT_TIMESTAMP`, and the route rounds the cursor to milliseconds through `toISOString()`. The client dedupes, so no row appears twice, but rows sharing the boundary timestamp can be skipped. The fix is server-side and in 03-03's files: a compound `(created_at, id)` cursor, or pass the raw timestamp and use `lte` with the client dedupe this plan already does. This was not done here because those files belong to another plan, and the fix needs a decision about cursor format.
- **Whole-tree check:** `tsc -b` fails only in another executor's in-progress files (`worker/test/admin-integrations.test.ts` and `worker/test/admin-lookup.test.ts`, which are part of an uncommitted `settings` change to `FirmIntegrationRow`; earlier also `smarty/client.test.ts` and `c-address.test.ts` from 06-01). `eslint .` passed with 0 errors. `pnpm test` passed: 92 files, 1188 tests. `vite build` succeeded and `check-file-sizes` passed. `golden.json is stale` is the known pre-existing failure.

## Known Stubs

None. Staff display names are not resolved, so every staff action reads `Staff`. The plan specifies this (T-03-22).

## Threat Flags

None. No new endpoints and no new trust-boundary surface. The SPA reads only the existing `/events` and `/review` routes. Client-written strings render as React text; no `dangerouslySetInnerHTML` is used.

## Next Phase Readiness

- Phase 4 provider events and Phase 5 `logics.*` events already appear in the timeline through the fallback. Add entries to `ACTION_LABELS` when nicer wording is wanted.
- Phase 3 code is complete (7 of 7 plans). The end-of-phase human checks listed above are still open.

## Self-Check: PASSED

All 13 created files exist; commits 13a7284 and f772420 are ancestors of HEAD; actor-badge.tsx has 0 raw palette classes; no dangerouslySetInnerHTML in the feature.

## Deploy

Deployed once with `pnpm -C app run deploy` at 10:33 EDT, after whole-tree `tsc -b`, `eslint .`, file sizes and `pnpm test` all passed (95 files, 1210 tests). The tsc errors from the other executor had cleared by then. Version `e379878a-f709-4850-b4a5-0cba8ecd9c09` is live at https://resspark.zh-a16.workers.dev. The working tree also held another executor's uncommitted plain `DOCUSEAL_*` vars in `wrangler.jsonc`, and they went out with this deploy.
