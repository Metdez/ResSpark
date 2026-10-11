---
phase: 03-uploads-review-live-status
plan: 03
subsystem: review
tags: [hono, supabase-storage, postgrest, rpc, react, tanstack-query, polling, signed-url]

requires:
  - phase: 03-uploads-review-live-status
    provides: "03-01 item_approve/item_reject RPCs, documents columns, case-documents signedReadUrl/ACCEPTED_MIMES; 03-06 documentStatusBadge, pollInterval, ago()"
  - phase: 02-find-the-client-send-the-link
    provides: "request page, StatusBadge, requestStatusBadge/itemStatusBadge, unlessHandled, staffAuth, admin error envelope"
provides:
  - "GET /api/admin/requests/:id/review { request, items[], client_session }"
  - "GET /api/admin/documents/:id/url (300 s signed URL, inline only for PDF/JPEG/PNG, document.viewed event)"
  - "POST /api/admin/items/:itemId/approve and /reject through item_approve/item_reject"
  - "GET /api/admin/cases/:id/events?before=&limit= (newest first, max 50, next_before)"
  - "features/review: ReviewPanel, DocumentRow, RejectDialog, useReview/useApprove/useReject, api client"
affects: [03-05 mirror card and timeline, 05 Logics push]

actuals:
  tokens: 20700
  tasks: 2
  commits: 31

plan_head_before: 43c28ac4f796420c9a6b55484735bb618a6e40ba
plan_head_after: eb0206c16eb576a0a1300b9dce41e0cfd18a9f76

tech-stack:
  added: []
  patterns:
    - "Staff document access: mint a 5-minute signed URL per click, open with window.open(url, '_blank', 'noopener'), never render in the admin origin"
    - "Decisions only through RPCs; the route maps bare RAISE tokens to ReviewError(code, status)"
    - "Mutations invalidate in onSettled (success and error) so a 409 also refetches the truth"

key-files:
  created:
    - app/worker/src/db/review.ts
    - app/worker/src/routes/admin-review.ts
    - app/worker/src/routes/admin-review.test.ts
    - app/worker/src/routes/admin-events.ts
    - app/worker/src/routes/admin-events.test.ts
    - app/worker/test/review-live.test.ts
    - app/src/features/review/api.ts
    - app/src/features/review/use-review.ts
    - app/src/features/review/document-row.tsx
    - app/src/features/review/reject-dialog.tsx
    - app/src/features/review/review-panel.tsx
    - app/src/features/review/review-panel.test.tsx
    - docs/app/worker/src/db/review.md
    - docs/app/worker/src/routes/admin-review.md
    - docs/app/worker/src/routes/admin-review.test.md
    - docs/app/worker/src/routes/admin-events.md
    - docs/app/worker/src/routes/admin-events.test.md
    - docs/app/worker/test/review-live.test.md
    - docs/app/src/features/review/api.md
    - docs/app/src/features/review/use-review.md
    - docs/app/src/features/review/document-row.md
    - docs/app/src/features/review/reject-dialog.md
    - docs/app/src/features/review/review-panel.md
  modified:
    - app/worker/src/index.ts
    - app/src/features/requests/request-page.tsx
    - app/src/features/requests/request-page.test.tsx
    - app/scripts/smoke.mjs
    - docs/app/worker/src/index.md
    - docs/app/src/features/requests/request-page.md
    - docs/app/scripts/smoke.md

key-decisions:
  - "Once a request is sent, ReviewPanel replaces the Phase 2 ItemsCard (drafts keep it); showing both would list every item twice"
  - "Malformed ids answer 404 not_found (not 400) on every review route, so a bad id reads like a foreign one"
  - "Worker caps the reject note at 500 chars after trim with its own code note_too_long; the RPC only checks non-empty"
  - "Case events return 404 for a case of another firm (a firm-scoped cases lookup first) instead of an empty page"
  - "Approve/reject invalidate review, request, requests and events in onSettled so a 409 refetches too"

patterns-established:
  - "Staff file access: signed URL per click + window.open noopener + document.viewed audit event"

requirements-completed: [UPL-03, UPL-04, STAT-02]

coverage:
  - id: D1
    description: "Firm-scoped review, document URL, approve/reject and case events routes with RPC error mapping"
    requirement: UPL-03
    verification:
      - kind: unit
        ref: "app/worker/src/routes/admin-review.test.ts + admin-events.test.ts (19/19)"
        status: pass
      - kind: integration
        ref: "app/worker/test/review-live.test.ts (live, 7/7)"
        status: pass
      - kind: integration
        ref: "pnpm -C app run smoke:auth <deployed> --auth#auth request send (review read, 409 approve, events)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reject marks the item and every ready document rejected with one note; approve is idempotent with one item.approved event; request status recomputed"
    requirement: UPL-04
    verification:
      - kind: integration
        ref: "app/worker/test/review-live.test.ts#rejects the item and both ready documents with one note, then approves it once"
        status: pass
    human_judgment: false
  - id: D3
    description: "Review panel: items/documents in order, Preview/Download via new tab noopener, Approve disabled without files, reject dialog with presets and 500-char limit, 5 s poll, invalidations"
    requirement: STAT-02
    verification:
      - kind: unit
        ref: "app/src/features/review/review-panel.test.tsx (9/9)"
        status: pass
      - kind: unit
        ref: "app/src/features/requests/request-page.test.tsx#shows the review panel instead of the items card once sent"
        status: pass
    human_judgment: false
  - id: D4
    description: "Human check: Preview opens the file in a new tab, Download saves under the original name, Reject reaches the client step within 10 s, Approve of the last required item flips the badge to Complete without reload"
    requirement: UPL-03
    human_judgment: true
    rationale: "Needs a signed-in staff browser and a real client upload; auto-approved in this --auto run, left for the end-of-phase UAT"

duration: 3h 9min (wall clock, includes two session restarts)
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 03: Staff review loop Summary

**Staff can now review uploads on the request page. Each item lists its files with Preview and Download, which open a fresh 5-minute signed URL in a new tab with `noopener`; Preview is inline only for PDF/JPEG/PNG. Approve and Reject-with-note go only through the `item_approve`/`item_reject` RPCs, and the panel polls every 5 s so the request badge flips to `Complete` and back without a reload. The `/review` (with `client_session`) and `/cases/:id/events` reads that Plan 05 renders are in place too.**

## Performance

- **Started:** 2026-10-11T09:42:24Z
- **Completed:** 2026-10-11T12:51:15Z (wall clock; the session restarted twice in between)
- **Tasks:** 2 (both TDD-flagged)
- **Files:** 30 (23 created, 7 modified)

## Accomplishments

- Worker: `db/review.ts`, `routes/admin-review.ts`, and `routes/admin-events.ts` are mounted under `/api/admin` behind `staffAuth`. Every read is firm-scoped in SQL. Documents are scoped through `request_items → requests.firm_id`, because `documents` has no `firm_id`.
- SPA: `features/review/*` is rendered on the request page for every non-draft request. All badges come from `lib/status.ts` and go through Phase 2's `StatusBadge`; there is no second badge and no local label helper.
- Deployed `856befc5-f703-4636-b124-9cf6879c576b` after `pnpm -C app run check` passed on the whole tree (72 files, 997 tests passed, 120 skipped).
- Proven live against the real database (`review-live.test.ts`, 7/7) and against the deployed Worker (`smoke:auth`, check `auth request send`). Unauthenticated requests to all four new paths on the deployed Worker return 401.

## Task Commits

1. **Task 1 RED:** `c0d2a38`: failing tests for the review and events routes (`test`).
2. **Task 1 GREEN:** `3172281`: the review and case-events API (`feat`). The `index.ts` mount hunk landed in `94beece` (see Issues).
3. **Task 2:** `1b3ba82`: the review panel, document row, reject dialog, hooks, and API client (`feat`).
4. **Task 2:** `8b21309`: mounts the panel on the request page, with the companion docs (`feat`).
5. **Verification:** `e619dde`: live DB test and deployed smoke checks (`test`).
6. **Coordinator request:** `106bb1c`: asserts that approve invalidates `['requests']` (`test`).

`commits: 31` is the measured `rev-list` count on the shared `zack` branch. It includes concurrent commits from 03-02, 03-04, 04-02, and 05-01. This plan made the 6 commits above.

## Recorded facts (requested by the plan's output section)

- **Phase 2 request-page file modified:** `app/src/features/requests/request-page.tsx`. It imports `ReviewPanel`, and `{d.status === 'draft' ? <ItemsCard/> : <ReviewPanel requestId={d.id} caseId={d.case.case_id}/>}` replaces the unconditional `<ItemsCard/>`. Its test now stubs `GET /api/admin/requests/r1/review` as pending and gains one case.
- **RPC error string → HTTP:**

  | RPC `RAISE` | `ReviewError` code | HTTP |
  |---|---|---|
  | `item_not_found` | `not_found` | 404 |
  | `item_not_submitted` | `item_not_submitted` | 409 |
  | `note_required` | `note_required` | 400 |
  | anything else | `rpc_failed` | 500 |

  Route-level checks:
  - A non-UUID id returns 404 `not_found`.
  - A blank note returns 400 `note_required`; a note over 500 characters returns 400 `note_too_long`. Neither calls the RPC.
  - An unknown `disposition` returns 400 `bad_request`.
  - On the events route, an unparsable `before` returns 400 `bad_request`, and a foreign case returns 404.
- **Human-check outcomes:** the plan's human check (preview, download, reject reaching the client, approve flipping the badge to `Complete`) was auto-approved under `--auto` (gate `blocking`). It was not exercised in a browser. The parts that tests can reach are proven: live RPC behaviour, the deployed authenticated review read, the 409, and the timeline. The browser walk remains for the end-of-phase UAT.

## Decisions Made

See `key-decisions`. The most visible one: after a request is sent, the review panel replaces the Phase 2 items card. The plan said "append … nothing else changes", but appending would have listed every item twice on the same page.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Request page would list items twice**
- **Found during:** Task 2
- **Fix:** `ItemsCard` now renders only for drafts; sent requests show `ReviewPanel`, which lists the same items. The Phase 2 draft test still passes, and a new test asserts there are no `ItemsCard` rows once the request is sent.
- **Commit:** `8b21309`

**2. [Rule 2 - Missing critical] Malformed ids, uploading documents, foreign cases**
- **Issue:** A non-UUID path id would reach Postgres and fail with a cast error (500). A document still `uploading` could have been signed. A foreign `case_id` on the events route would have returned an empty 200, which tells the caller the case exists.
- **Fix:** UUID check → 404. Only `ready`/`rejected` documents get a URL. `listCaseEvents` checks the case's firm first and returns `null` → 404.
- **Commit:** `3172281`

**3. [Rule 2 - Missing critical] Invalidate after errors too, plus the request detail key**
- **Fix:** Invalidation moved to `onSettled`, so a 409 also refetches. `['request', requestId]` was added so the Phase 2 header badge follows the decision.
- **Commit:** `1b3ba82`

**4. [Rule 3 - Blocking] RED evidence format**
- The `--reporter=json` output is not supported by `tdd-red-evidence`. The run was redone with `--reporter=junit` and returned `RED_EVIDENCE_OK`. The record is kept under `.planning/phases/03-uploads-review-live-status/red/` (untracked).

**5. [Scope] Live DB test and deployed smoke checks added**
- The unit tests mock `db/review`, so the PostgREST embeds (filtered `documents`, `referencedTable` ordering, `client_links!inner`, the two-level firm join) had no other proof. `worker/test/review-live.test.ts` was added, plus three checks in `scripts/smoke.mjs` `requestSend`. My first smoke version expected a `client_session` right after the link was opened. That was wrong, because only the heartbeat writes `client_sessions`, so the check now accepts `null`.

**6. [Convention] `variant="destructive"` acceptance grep**
- `reject-dialog.tsx` has `variant='destructive'`. The codebase writes JSX attributes with single quotes, and that style was kept. The criterion's intent is met; only the literal grep with double quotes fails.

**Total deviations:** 3 auto-fixed (1 bug, 2 missing-critical), 1 blocking (evidence format), 1 scope addition, 1 convention note. **Impact:** the API surface is as planned; the changes add safety and proof.

## TDD Gate Compliance

| Task | RED | GREEN | Status |
|------|-----|-------|--------|
| 1 | `c0d2a38`, junit evidence `RED_EVIDENCE_OK`. The target "returns the request, items with nested documents…" failed with `expected 404 to be 200` because the route was not mounted. That is the planned assertion. | `3172281` (19/19) | compliant |
| 2 | **Missing.** The tests and the implementation were written together before the session restart, and no failing run was captured. | `1b3ba82` (8/8, now 9/9) | violation recorded |

## Issues Encountered

- **The `index.ts` mount landed in another executor's commit.** My additive hunk (imports plus two `app.route` lines) was in the working tree when 04-02 committed `94beece` with `git commit -- app/worker/src/index.ts`, so their commit includes it. No hunk of theirs was rewritten. `3172281` holds the route files and the `index.md` doc delta.
- **One full-check run failed on a timing flake.** `request-builder.test.tsx` "loads the case…" timed out its `waitFor` while several executors were running suites at once. That file is not this plan's. It passed alone (8/8), and the next full `check` was green (exit 0).
- The session restarted twice mid-task 2. No work was lost; the coordinator's resume steps were followed.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. The `document.viewed` event stores `{ document_id, disposition }` only; the URL is never logged.

## Next Phase Readiness

- Plan 05 can render `client_session` from `/review` and page the timeline with `/cases/:id/events?before=<next_before>`, using the query key `['events', caseId]`. The decisions already invalidate that key.
- Shortcuts with `shortcut:` comments:
  - The events cursor uses `created_at` only, so same-transaction events can be skipped at a page edge.
  - `window.open` runs after an await, so a strict popup blocker may block it.

## Self-Check: PASSED

- All 23 created files exist on disk.
- Commits `c0d2a38`, `3172281`, `1b3ba82`, `8b21309`, `e619dde` and `106bb1c` are ancestors of HEAD.
- Acceptance greps passed (Task 1: 14/14; Task 2: 18/19, the remaining one is the quote-style note above).
- Every new source file is under 500 lines; the largest is `db/review.ts` at 211.
- `pnpm -C app run check`: exit 0. The live test passed 7/7, and the deployed smoke `auth request send` returned `ok`.
