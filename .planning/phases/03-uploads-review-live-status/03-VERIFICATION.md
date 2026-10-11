---
phase: 03-uploads-review-live-status
verified: 2026-10-11T15:45:00Z
status: human_needed
score: 6/7 must-haves verified
covered_files:
  - .planning/phases/03-uploads-review-live-status/03-01-PLAN.md
  - .planning/phases/03-uploads-review-live-status/03-01-SUMMARY.md
  - .planning/phases/03-uploads-review-live-status/03-02-PLAN.md
  - .planning/phases/03-uploads-review-live-status/03-02-SUMMARY.md
  - .planning/phases/03-uploads-review-live-status/03-03-PLAN.md
  - .planning/phases/03-uploads-review-live-status/03-03-SUMMARY.md
  - .planning/phases/03-uploads-review-live-status/03-04-PLAN.md
  - .planning/phases/03-uploads-review-live-status/03-04-SUMMARY.md
  - .planning/phases/03-uploads-review-live-status/03-05-PLAN.md
  - .planning/phases/03-uploads-review-live-status/03-05-SUMMARY.md
  - .planning/phases/03-uploads-review-live-status/03-06-PLAN.md
  - .planning/phases/03-uploads-review-live-status/03-06-SUMMARY.md
  - .planning/phases/03-uploads-review-live-status/03-07-PLAN.md
  - .planning/phases/03-uploads-review-live-status/03-07-SUMMARY.md
  - app/src/features/client-portal/portal-api.ts
  - app/src/features/client-portal/portal-page.tsx
  - app/src/features/client-portal/step-list.tsx
  - app/src/features/dashboard/request-table.tsx
  - app/src/features/dashboard/use-requests.ts
  - app/src/features/requests/request-page.tsx
  - app/src/features/review/mirror-card.tsx
  - app/src/features/review/review-panel.tsx
  - app/src/features/review/use-review.ts
  - app/src/features/timeline/api.ts
  - app/src/features/timeline/labels.ts
  - app/src/features/timeline/timeline.tsx
  - app/src/features/uploads/accept.ts
  - app/src/features/uploads/copy.ts
  - app/src/features/uploads/preprocess.ts
  - app/src/features/uploads/transport.ts
  - app/src/features/uploads/upload-sheet.tsx
  - app/src/lib/polling.ts
  - app/src/lib/relative-time.ts
  - app/src/lib/status.ts
  - app/worker/src/db/dashboard.ts
  - app/worker/src/db/documents.ts
  - app/worker/src/db/review.ts
  - app/worker/src/routes/admin-events.ts
  - app/worker/src/routes/admin-requests.ts
  - app/worker/src/routes/admin-review.ts
  - app/worker/src/routes/c-uploads.ts
  - app/worker/src/storage/case-documents.ts
  - supabase/migrations/0004_uploads_review.sql
covered_digest: "v3:sha256:b0a5d51a878136483b0b9a113368de1d2fc921ab65e70ab201fceec91a045e68"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/7
  gaps_closed:
    - "Timeline paging: exactly 50 events renders Load older and the next page starts strictly before the last created_at with no duplicate or skipped row (03-05 must-have, STAT-04 edge set)"
    - "Staff can see which step the client is on and the last error the client hit (ROADMAP SC4, STAT-03)"
    - "Warning: request-page header badge did not poll (STAT-02)"
  gaps_remaining: []
  regressions: []
advisory: []
behavior_unverified_items:
  - truth: "An interrupted upload resumes after a reload (ROADMAP SC1, UPL-01)"
    test: "On a phone, start a large PDF upload on a live client link, reload mid-upload, reopen the item and pick the same file"
    expected: "Progress continues from the stored TUS offset (no second document row; the 10-file count does not grow) and the row ends at 'Sent to your agent'"
    why_human: "transport.test.ts exercises the pending map and re-mint with a mocked tus-js-client; the real re-mint + resumeFromPreviousUpload against Supabase Storage has never run end to end"
human_verification:
  - test: "Product decision (D-06 wording): a request with some items approved and the rest still pending reads 'Opened' on the dashboard. Should it read 'In progress'?"
    expected: "User answers. If 'In progress': new additive migration adding 'approved' to n_active in request_status() (the 0004 function body stays otherwise identical), flip the one assertion in worker/test/request-status.test.ts, and also call request_apply_status after the mint's pending→in_progress write in db/documents.ts createUploadingDocument so a client who has started uploading shows 'In progress' too"
    why_human: "The SQL matches locked D-06 as written; whether D-06 is what ValorTax wants is a product call (Andrew: 'in progress, and then it's done')"
  - test: "Real phone upload: on a live client link, take a photo and pick a synthetic PDF from examples/ for one upload item; reload and reopen; try a .txt, a HEIC over 6 MB, and a 30 MB PDF"
    expected: "Photo and PDF show per-file progress then 'Sent to your agent'; after reload both are listed in upload order; .txt refused with 'We can take PDFs and photos (JPG, PNG, HEIC).'; HEIC uploads as a JPEG under 25 MB; 30 MB PDF refused before upload"
    why_human: "Camera capture, HEIC conversion and canvas re-encoding run only in a real mobile browser (also the 03-02 backstop truth, insufficient_spec)"
  - test: "Interrupted upload resumes after reload (see behavior_unverified_items)"
    expected: "Upload continues from its offset and completes once"
    why_human: "Live TUS resume never exercised by a test"
  - test: "Staff review: open the request page for that upload, click Preview and Download on each file, reject one item with a preset note, then approve the rest"
    expected: "Preview opens a new tab inline (PDF/JPEG/PNG), Download saves under the original name, the client's step shows 'Needs attention' and the sheet shows 'Your agent asked for a new copy: <note>' with 'Upload again' within 10 s; after re-upload and approval of the last required item both the header badge and the panel badge read Complete without a reload"
    why_human: "Signed-URL tabs, popup blockers and the cross-device loop need a signed-in browser plus a phone"
  - test: "Dashboard live update: open /admin in one tab and the request page in another; approve the last required item; then hide the /admin tab for 30 s"
    expected: "The /admin row flips to Complete within 5-10 s with no reload; the Network tab shows no /api/admin/requests calls while hidden and one on return; a status filter survives reload"
    why_human: "Visibility-paused polling and real timing are browser behavior"
  - test: "Mirror and timeline: with the client on the upload step, watch the request page; have the client pick a .txt in the upload sheet; then leave the client idle 11 minutes"
    expected: "'Client is on: upload — last seen …' within 10 s; after the .txt pick the mirror's last error reads 'Upload refused: not a PDF or photo' within 10 s; 'Client may be stuck' after 10 minutes; timeline shows lookup, send, open, upload, approve, reject in order with Staff/Client badges"
    why_human: "Real heartbeat cadence, deployed Worker storage of the new codes, and wall-clock thresholds"
  - test: "Post-deploy Load older on a case with more than 50 events (e.g. case 00000000-0000-0000-0000-0000000000e1, 269 events): open its request page timeline and click Load older until it disappears"
    expected: "269 distinct events in strict newest-first order, no duplicates, no 400 from /api/admin/cases/:id/events; the Network tab shows before=<created_at>|<id> with microseconds"
    why_human: "The compound or() filter is proven by the route unit test and by an equivalent read-only SQL check on live data, but PostgREST parsing of the quoted microsecond timestamp has not run against the deployed Worker (no read-only live test exists; review-live.test.ts seeds rows and uses a null cursor)"
  - test: "Review the 17 judgment-tier prohibitions in 03-01..03-07 (bytes never through the Worker, no third-party/LLM send, approve only via item_approve, additive-only 0004, no Realtime, no second badge, no inline signed-URL render, no forbidden imports in features/uploads, test-firm-only fixtures, strict denial assertions)"
    expected: "Human confirms; LLM-judge verdict (non-authoritative): all 17 held on the code read in this verification and still hold after the gap-closure commits"
    why_human: "unverified-prohibition — human review recommended (judgment tier, no enforcement test)"
---

# Phase 3: Uploads, Review & Live Status Verification Report

**Phase Goal:** As a ValorTax case manager, I want to review what clients upload from their phones and watch status update live, so that I can approve or reject each item without chasing anyone.
**Mode:** mvp (user story validated by `user-story.validate`: true)
**Verified:** 2026-10-11T15:02:58Z
**Status:** human_needed (re-verified 2026-10-11; the initial run below found gaps_found)
**Re-verification:** Yes. See "Re-verification (2026-10-11)" at the end; the sections below are the initial verification.

Phase 3 is judged on its committed code only. `git status` shows no uncommitted changes under `app/`, `supabase/` or `docs/` from Phase 3. One untracked file (`app/src/features/review/address-card.tsx`) appeared during the run; it belongs to another executor and was ignored.

## User Flow Coverage (MVP)

| Story step | Expected | Evidence in codebase | Status |
|---|---|---|---|
| Client uploads from the phone | Camera/files, per-file progress, type refusal, shrink, resume | `features/uploads/*` (accept, preprocess, TUS transport, sheet), `routes/c-uploads.ts`, bucket live (private, 25 MiB, pdf/jpeg/png) | VERIFIED, except resume after reload (behavior unverified) |
| Staff review each item | Preview/download via short-lived URL; approve, or reject with a note | `routes/admin-review.ts` (300 s signed URL, `document.viewed`), `item_approve`/`item_reject` RPCs, `features/review/*` | VERIFIED |
| Watch status update live | Dashboard and request page poll every 5 s while visible | `pollInterval` in `use-requests.ts`, `use-review.ts`, `timeline.tsx`; invalidations on decisions | VERIFIED (header badge on request page does not poll; warning) |
| Without chasing anyone | Mirror of client step and last error; timeline | `mirror-card.tsx`, `timeline.tsx`, `/review` `client_session`, `/cases/:id/events` | PARTIAL: upload errors never reach the mirror; timeline paging can skip rows |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1a | SC1: client uploads one or more files per item from camera roll, camera or files with per-file progress; non-PDF/JPG/PNG/HEIC refused; large photos shrunk (UPL-01, UPL-02) | ✓ VERIFIED | `accept.ts` (ext-first, empty refusal), `preprocess.ts` (`MAX_EDGE` 2000, JPEG 0.82, lazy `heic2any`), `upload-sheet.tsx` (`capture='environment'` + no-capture picker, `allSettled`), `c-uploads.ts` 415/413 and 16-byte sniff → 422 with delete. Live bucket query: private, 26214400, pdf/jpeg/png. Uploads/worker unit tests pass (161 web, 57 worker); live `uploads.test.ts` 5/5 recorded in 03-01. |
| 1b | SC1: an interrupted upload resumes after a reload | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | TUS with `x-signature`, fingerprint `rs-<document_id>`, `rs_pending_uploads` + `/token` re-mint all present and wired; only mocked in `transport.test.ts`. Never run against Storage. |
| 2 | SC2: staff preview/download via short-lived link, approve or reject with note; rejected item returns to the client with the note; item complete only on approval; request complete when every required item approved (UPL-03, UPL-04) | ✓ VERIFIED | `admin-review.ts` (`EXPIRES_IN = 300`, inline only for sniffed types, `document.viewed` without URL); RPCs only path to `approved` (grep: no direct `status: 'approved'` writes in `worker/src`); `upload_complete` only reaches `submitted`; live `request_status()` definition matches 0004 (checked read-only); 03-07 live matrix (12 cases) and `review-live.test.ts` 7/7 recorded. Client sees note in the sheet (`item.rejection_note` via `/api/c/items/:id/documents`) and the chip reads `Needs attention`. |
| 3 | SC3: dashboard lists requests with status, age, overdue, sortable and filterable; status moves to done within 5-10 s with no reload (STAT-01, STAT-02) | ✓ VERIFIED | `request_dashboard_v` (overdue = sent ≥ 3 d and not complete/revoked), `db/dashboard.ts` (status allowlist, sanitized `q`, firm-scoped), `/admin` route with zod search params, `columns.tsx` (`OVERDUE_BADGE`, `sortingFn: 'text'`), `use-requests.ts` key `['requests', status, q]` + `pollInterval` + `keepPreviousData`; decisions invalidate `['requests']`. Real timing is a human check. See D-06 decision and header-badge warning. |
| 4 | SC4: staff see which step the client is on and the last error the client hit (STAT-03) | ✗ FAILED (partial) | Step and stuck hint work (`mirror-card.tsx`, `getLatestClientSession`). `last_error` only receives `state_failed`/`start_failed` from `portal-page.tsx`; `upload-sheet.tsx` errors are never reported, so the mirror is blank for upload failures. |
| 5 | SC5: case view shows a timeline of who did what and when (lookup, send, open, upload, approve, reject), provider events join later (STAT-04) | ✓ VERIFIED | `/api/admin/cases/:id/events` firm-scoped, newest first; `labels.ts` covers the actions the Worker writes (incl. `request.email_sent`), unknown actions fall back to words; `actor-badge.tsx` incl. Provider. Read-only DB check: `case.looked_up` 52/52, `request.sent` 37/37, `request.opened` 21/21, `document.uploaded` 18/18, `item.approved` 61/61, `item.rejected` 18/18 carry `case_id`. |
| 6 | 03-05 must-have: Load older at a 50-row edge has no duplicate or skipped row | ✗ FAILED | `db/review.ts` `listCaseEvents` uses `lt('created_at', before)`; `admin-events.ts` truncates the cursor to ms via `toISOString()`. Same-timestamp groups exist live (max 3 per case per timestamp), 4 cases already exceed 50 events. Duplicates are prevented client-side (dedupe by id); skips are not. |

**Score:** 4/7 truths verified (1 present, behavior-unverified; 2 failed)

The remaining plan must-haves (03-01..03-07) were checked and folded into the rows above. All of them hold on the code, except the two failures listed. Highlights:
- the lock order (requests, then items, then documents);
- idempotent approve and complete;
- the cross-firm 404;
- UUID 404 before any query;
- the `listItemDocuments` order;
- the `ago`/`pollInterval`/status atoms;
- `StatusBadge` untouched;
- the anon denial (live `anon` EXECUTE = false on all five functions, read-only `has_function_privilege` check).

Two plan truths are backstop (non-inferable) and route to human verification as `insufficient_spec`:
- 03-01: an interrupted complete is finished by the next complete call;
- 03-02: a real HEIC photo over 6 MB uploads.

Note on the 03-01 backstop: the SPA has no path that calls `complete` again for a document whose TUS upload finished but whose `complete` never ran. `removeFingerprintOnSuccess` drops the resume key, and a re-pick then hits `upload_failed` (object exists, `x-upsert: false`) and mints a new document. The original row stays `uploading`: hidden from staff, but counted toward the 10-file cap.

### Required Artifacts

`verify.artifacts`: 27/27 across all seven plans (exists + substantive).

| Artifact | Status | Details |
|---|---|---|
| `supabase/migrations/0004_uploads_review.sql` | ✓ VERIFIED | applied (`db-migrate --status` lists it); bucket, 5 functions, view, grants confirmed live |
| `app/worker/src/storage/case-documents.ts` | ✓ VERIFIED | Range read fails closed on non-206; 416 → empty → sniff fails |
| `app/worker/src/db/documents.ts`, `routes/c-uploads.ts` | ✓ VERIFIED | mounted at `/api/c`; deployed probe 401 `no_session` |
| `app/worker/src/db/review.ts`, `routes/admin-review.ts`, `routes/admin-events.ts` | ✓ VERIFIED (cursor defect, gap 1) | mounted at `/api/admin` behind `staffAuth` |
| `app/worker/src/db/dashboard.ts`, `routes/admin-requests.ts` | ✓ VERIFIED | one `GET /` handler; `listRequests` removed |
| `app/src/features/uploads/*` | ✓ VERIFIED | wired from `step-list.tsx` |
| `app/src/features/review/*`, `timeline/*` | ✓ VERIFIED | rendered in `request-page.tsx` non-draft branch |
| `app/src/features/dashboard/*` | ✓ VERIFIED | `routes/admin/_shell/index.tsx` |
| `app/src/lib/status.ts`, `polling.ts`, `relative-time.ts` | ✓ VERIFIED | consumed by all four features |
| `app/worker/test/fixtures/request.ts`, `request-status.test.ts`, `phase3-anon.test.ts` | ✓ VERIFIED | env-gated live suites (skip without env; results recorded in 03-07) |

### Key Link Verification

`verify.key-links`: 21/22. The one miss is a pattern artifact. `use-requests.ts` calls `fetchRequests` in `dashboard/api.ts`, which requests `/api/admin/requests?…` (line 72), so the link is WIRED.

| From | To | Via | Status |
|---|---|---|---|
| `upload-sheet.tsx` | `/api/c` routes | `mintUpload`/`remintToken`/`completeUpload` via `portalFetch` | WIRED |
| `transport.ts` | Supabase Storage | TUS `x-signature` with the mint token | WIRED |
| `step-list.tsx` | `UploadSheet` | `viewing?.kind === 'upload'` | WIRED |
| `db/documents.ts`, `db/review.ts` | 0004 RPCs | `rpc('upload_complete' / 'item_approve' / 'item_reject')` | WIRED |
| `use-review.ts`, `timeline.tsx`, `use-requests.ts` | Worker routes | `useQuery` + `pollInterval` | WIRED |
| `request-page.tsx` | `MirrorCard`, `ReviewPanel`, `Timeline` | non-draft branch | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| Dashboard table | rows | `request_dashboard_v` (requests ⋈ cases ⋈ latest link, `max(events.created_at)`) | yes | ✓ FLOWING |
| Review panel | items + documents | `request_items` embed `documents` filtered `ready/rejected` | yes | ✓ FLOWING |
| Mirror card | `client_session` | latest `client_sessions` via `client_links!inner` | yes (step); error only portal codes | ⚠️ partial (gap 2) |
| Timeline | events | `events` by firm + case | yes (live rows carry `case_id`) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Whole-tree gate | `pnpm -C app run check` | file sizes, golden, `tsc -b`, eslint (0 errors, 7 warnings) pass; tests 1209 passed, 1 failed (`request-builder.test.tsx` waitFor timeout, a Phase 2 file) | ✓ PASS for Phase 3 (the failure is a known load flake; it passes alone, below) |
| Phase 3 web tests + flaky file alone | `vitest run --project web` on uploads, review, timeline, dashboard, lib atoms, step-list, request-page, request-builder | 18 files, 161/161 | ✓ PASS |
| Phase 3 worker unit tests | `vitest run --project worker-node` on c-uploads, case-documents, admin-review, admin-events, dashboard | 5 files, 57/57 | ✓ PASS |
| Deployed unauthenticated smoke | `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev` | 13/13 ok (incl. `/api/c 401 no_session`, `/admin`) | ✓ PASS |
| Migrations | `node app/scripts/db-migrate.mjs --status` | 0002–0007 applied, incl. `0004_uploads_review` | ✓ PASS |
| Live schema (read-only) | `--query` on `storage.buckets`, `pg_proc`, `has_function_privilege('anon', …)` | bucket private/25 MiB/pdf-jpeg-png; 5 functions present; anon EXECUTE false on all | ✓ PASS |
| Cursor defect exposure (read-only) | `--query` on events per case / per timestamp | 4 cases > 50 events; up to 3 events share one `created_at`; no current page edge lands inside a group | latent defect confirmed |

Live suites (`test:live`, `test:rls`, `smoke:auth`) were not run, per instructions. This report uses the results recorded in the SUMMARYs:
- `uploads.test.ts` 5/5;
- `review-live.test.ts` 7/7;
- `request-status.test.ts` + `uploads.test.ts` 17/17, three runs;
- `phase3-anon.test.ts` 6/6;
- `rls.test.ts` 28/28.

### Probe Execution

No phase-declared `scripts/*/tests/probe-*.sh`. Step 7c is not applicable.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| UPL-01 | 03-01, 03-02 | ✓ SATISFIED (resume needs human) | direct-to-Storage TUS, per-file progress, multi-file |
| UPL-02 | 03-01, 03-02 | ✓ SATISFIED | client accept rules + Canvas/HEIC; server mime allowlist, size cap, 16-byte sniff |
| UPL-03 | 03-02, 03-03, 03-06, 03-07 | ✓ SATISFIED (browser flow needs human) | signed 300 s URLs, approve/reject RPCs, note to client sheet |
| UPL-04 | 03-01, 03-03, 03-07 | ✓ SATISFIED | `request_status()` + live matrix |
| STAT-01 | 03-04, 03-06 | ✓ SATISFIED (D-06 wording open) | dashboard table, chips, search, sort, overdue |
| STAT-02 | 03-03, 03-04, 03-06 | ✓ SATISFIED (header badge warning) | 5 s visible-only polling, invalidations |
| STAT-03 | 03-05 | ✗ PARTIAL | step mirror yes; upload errors not mirrored (gap 2) |
| STAT-04 | 03-03, 03-05 | ✗ PARTIAL | timeline yes; page-edge skip (gap 1) |

No orphaned requirements: REQUIREMENTS.md maps exactly UPL-01..04 and STAT-01..04 to Phase 3, and every one is claimed by a plan. REQUIREMENTS.md already marks all eight `[x]`. That is premature for STAT-03 and STAT-04.

### Decision Coverage

All 11 trackable CONTEXT.md decisions are honored by the shipped artifacts (`check.decision-coverage-verify`: 11/11, non-blocking gate).

### Test Quality Audit

| Test File | Linked Req | Skipped | Circular | Assertion Level | Verdict |
|---|---|---|---|---|---|
| `worker/test/request-status.test.ts` | UPL-03/04 | env-gated `skipIf` only | no | value/behavioral | OK |
| `worker/test/uploads.test.ts` | UPL-01/02 | env-gated | no | behavioral | OK |
| `worker/test/phase3-anon.test.ts` | security | env-gated | no | status + code + `data === null` | OK |
| `worker/test/review-live.test.ts` | UPL-03 | env-gated | no | behavioral | OK |
| `features/uploads/*.test.ts(x)` | UPL-01/02 | none | no | value | OK |
| `features/review`, `timeline`, `dashboard` tests | STAT-01..04 | none | no | value | OK; no test covers the equal-timestamp page edge |

Disabled tests on requirements: 0. Circular patterns: 0. Insufficient assertions: 1 (STAT-04 page edge has no test; see gap 1).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `app/worker/src/db/review.ts` | `listCaseEvents` | `shortcut:` created_at-only cursor | 🛑 Blocker (backs gap 1) | skipped timeline rows on Load older |
| `app/src/features/requests/request-page.tsx` | 52-56, 115 | header `StatusBadge` from a `['request', id]` query with no `refetchInterval` | ⚠️ Warning | after a client upload the header badge stays `Opened` while the review panel badge below reads `Waiting on staff` until a staff action or reload. Fix: add `refetchInterval: pollInterval` to that `useQuery` (or hide the header badge when not draft) |
| `app/worker/src/db/documents.ts` | 111-118 | `createUploadingDocument` writes `request_items.status = 'in_progress'` directly, with no `request_apply_status` and no event | ⚠️ Warning | the stored `requests.status` can disagree with `request_status()` until the next RPC; an abandoned upload leaves the request `Opened`. Tie to the D-06 decision |
| `app/src/features/uploads/upload-sheet.tsx` | `send()` | a TUS upload that finished without `complete` leaves an `uploading` row that no SPA path completes | ⚠️ Warning | hidden from staff, but counts toward the 10-file cap (03-01 backstop truth) |
| 9 Phase 3 test files | — | companion docs missing: `uploads/{accept,api,preprocess,transport}.test`, `uploads/upload-sheet.test`, `review/{review-panel,mirror-card}.test`, `timeline/{labels,timeline}.test` | ⚠️ Warning | project rule: every code file has a `docs/` companion (dashboard tests have theirs) |
| `app/worker/src/db/dashboard.ts` | `or(...)` | each column `ilike` separately | ℹ️ Info | a search like `Ann Smith` matches no row |
| `app/src/features/review/document-row.tsx` | 25 | `shortcut:` `window.open` after await | ℹ️ Info | Safari popup blocker may block Preview |

Debt-marker scan (`TBD|FIXME|XXX`) over every Phase 3 file: none.

### Human Verification Required

1. **D-06 product decision.** A request with some items approved and the rest pending reads `Opened`. Should it be `In progress`? If yes, three changes:
   - an additive migration that adds `approved` to `n_active`;
   - flip one assertion in `request-status.test.ts`;
   - call `request_apply_status` after the mint's item update.
2. **Real phone upload.** Photo plus PDF, reload listing, `.txt` refusal, HEIC over 6 MB, 30 MB PDF refusal.
3. **Resume after reload.** This is a live TUS resume, behavior-unverified.
4. **Staff review loop.** Preview, download, reject with a note that reaches the client within 10 s, re-upload, then approve to `Complete` with no reload.
5. **Dashboard live update.** The row flips within 5-10 s, a hidden tab pauses polling, and the filter survives a reload.
6. **Mirror and timeline on a real request.** Step within 10 s, the stuck hint after 10 minutes, timeline order and labels.
7. **Judgment-tier prohibitions (17).** The LLM-judge verdict is non-authoritative: all held. Human review is recommended.

### Gaps Summary

The phase delivers its core loop end to end: a client uploads from a phone straight to Storage, staff preview and approve or reject, the request completes on the last required approval, and the dashboard and request page poll live. Two must-haves are not met. Both are small and server- or SPA-local.

1. **Timeline paging can skip events (STAT-04, 03-05 truth).** The cursor is `created_at` only and is truncated to milliseconds. Smallest fix, server-only:
   - Make `next_before` an opaque `"<created_at>|<id>"` string.
   - In `admin-events.ts`, split and validate it without `toISOString()`.
   - In `db/review.ts`, change the filter to `or(created_at.lt."ts", and(created_at.eq."ts", id.lt.<id>))`.
   - Add a unit test.
   - The SPA already passes the cursor through untouched.
2. **The mirror's "last error" misses upload errors (STAT-03, ROADMAP SC4).** Smallest fix:
   - Add an `onError` prop to `UploadSheet`.
   - Thread it through `StepList` into `portal-page.tsx` state that feeds `useHeartbeat`'s `lastError`.
   - Widen the `HeartbeatBody.last_error` type.

   **This looks intentional.** 03-02 scoped `last_error` to the Phase 2 code set. If the user accepts that, add to this frontmatter:

   ```yaml
   overrides:
     - must_have: "Staff can see which step the client is on and the last error the client hit"
       reason: "Mirror shows the client's step plus portal load errors only; upload errors are shown to the client in the sheet and are not mirrored in v1"
       accepted_by: "{name}"
       accepted_at: "{ISO timestamp}"
   ```

Gap 1 could also be overridden as an accepted shortcut. There is a real chance of hitting it, though: 4 cases already have more than 50 events. The fix is about 15 lines.

No gap is deferred: no later phase's goal or success criteria cover timeline paging or upload-error mirroring. Phase 8's stuck alerts cover reminders, not errors.

---

_Verified: 2026-10-11T15:02:58Z_
_Verifier: Claude (gsd-verifier)_

## Gap closure (2026-10-11)

Both blocking gaps and the header-badge warning are fixed, with tests. Live behaviour was not re-run, and the frontmatter `status` is left for re-verification.

| Gap | Fix | Commit | Evidence |
|---|---|---|---|
| 1. Timeline cursor skips rows (STAT-04, 03-05 truth) | `next_before` is now `"<created_at>\|<id>"` of the last row, using the raw Postgres string. `admin-events.ts` `parseCursor` needs exactly two parts. The timestamp must match a strict timestamptz shape and pass `Date.parse`, and the id must be digits. Anything else gets 400 `bad_request`. There is no `toISOString` any more. `db/review.ts` `listCaseEvents(before: {ts, id})` filters with `or(created_at.lt."ts",and(created_at.eq."ts",id.lt.id))` (`beforeFilter`), ordered `created_at desc, id desc`. The `shortcut:` comment is removed. `features/timeline/api.ts` passes the cursor through untouched and was not changed. | `90d0730` | `admin-events.test.ts` 12/12. It covers: a cursor round-trip with microseconds and an id; a tie at the page edge (the filter requests same-timestamp rows with a lower id); 5 malformed cursors → 400 with no query, including filter syntax inside the timestamp. |
| 2. Upload errors never reach the mirror (STAT-03, SC4) | `uploads/copy.ts` exports `UploadErrorCode`: the client error keys plus `upload_failed`. `uploadErrorCode()` maps any other code to `upload_failed`, so no free text is sent. `UploadSheet` takes `onError?` and calls it from `fail()`. `StepList` passes `onUploadError` to it. `PortalPage` keeps the latest code in state and sends it as `last_error`, in this order: `state_failed`, then `start_failed`, then the upload code. `HeartbeatBody.last_error` is widened to that set. The Worker heartbeat stores up to 200 chars and has no allowlist, so it needed no change. `MirrorCard` now has staff wording for all 10 upload codes. | `296a027` | `upload-sheet.test.tsx`: `onError` gets `unsupported_type` for a `.txt` and `upload_failed` for an unknown mint code. `portal-page.test.tsx`: after a `.txt` pick in the sheet, a heartbeat carries `last_error: 'unsupported_type'`. `mirror-card.test.tsx`: three upload codes render staff wording. In the scoped run, 13 files / 126 tests passed. |
| Warning: the header badge never refreshes | `request-page.tsx`: `refetchInterval: pollInterval` on `['request', id]` | `d7b6c88` | `request-page.test.tsx` 16/16. The new test checks that the query's `refetchInterval` is `pollInterval`. |

Whole-tree gate after the three commits: `pnpm -C app run check` passed (107 files passed, 20 skipped; 1372 tests passed, 175 skipped). The orchestrator handles the deploy. The companion docs were updated in the same commits.

Still open (out of scope here): the D-06 wording decision and the human checks listed above, including the live TUS resume.

## Re-verification (2026-10-11)

**Status:** human_needed. **Score:** 6/7 truths verified (1 present, behavior-unverified: live TUS resume). Both gaps are closed and the header-badge warning is fixed. No regressions.

Judged on committed code at `fc1d9e6`. Every Phase 3 file is identical in the working tree and at HEAD. The only modified tracked file is `app/worker/src/routes/c-connections.test.ts`, which belongs to Phase 4. The untracked `connect/`, `review/connections/` and `financials/` folders belong to other executors. No HEAD file imports them.

### Gap results

| # | Truth | Before | Now | Evidence |
|---|---|---|---|---|
| 6 | Load older at a 50-row edge skips and repeats nothing (03-05, STAT-04) | ✗ FAILED | ✓ VERIFIED | **Route** (`admin-events.ts` at HEAD): `next_before` is `` `${last.created_at}\|${last.id}` ``, the raw PostgREST string. `parseCursor` requires exactly two parts, a strict timestamptz regex plus `Date.parse`, and a 1-18 digit id. Anything else returns 400 before any query. There is no `toISOString` left.<br>**Query** (`db/review.ts`): `listCaseEvents` uses `q.or(beforeFilter(before))`, which is `created_at.lt."ts",and(created_at.eq."ts",id.lt.id)`, ordered `created_at desc, id desc`.<br>**SPA**: `timeline/api.ts` sends the cursor with `encodeURIComponent`, so `+` and `\|` survive the trip.<br>**Tests**: `admin-events.test.ts` round-trips a microsecond cursor and pins the tie filter. 5 malformed cursors return 400 with no query.<br>**Live data** (read-only SQL with the same predicate): for all 4 cases over 50 events (269, 178, 159, 162 events), 50 rows plus the rows after the cursor equals the total, so no row is skipped. |
| 4 | Staff see the client's step and the last error the client hit (SC4, STAT-03) | ✗ FAILED (partial) | ✓ VERIFIED | **Sheet**: every `UploadSheet` error path (accept refusal, size or empty after preprocess, mint, TUS, complete) goes through `fail()`, which calls `onError?.(uploadErrorCode(code))`.<br>**Codes**: `uploadErrorCode` maps unknown codes to `upload_failed`, so no free text is sent.<br>**Wiring**: `StepList` passes `onUploadError` to the sheet. `PortalPage` keeps the code in `uploadError` state and feeds `useHeartbeat` `lastError` in priority order (`state_failed`, then `start_failed`, then the upload code). The heartbeat effect depends on `lastError`, so it sends at once.<br>**Worker**: `client-portal.ts` stores `optionalText(last_error, 200)`, and `getLatestClientSession` returns it to `/review`.<br>**Staff copy**: `MirrorCard` has wording for all 10 upload codes.<br>**Tests**: `portal-page.test.tsx` picks a `.txt` in the real sheet and sees a heartbeat with `last_error: 'unsupported_type'`. `upload-sheet.test.tsx` and `mirror-card.test.tsx` cover the code mapping and the staff wording. |
| — | Warning: the header badge does not poll (STAT-02) | ⚠️ | fixed | `request-page.tsx` `['request', id]` now has `refetchInterval: pollInterval`, which pauses when the tab is hidden. `request-page.test.tsx` asserts the option. |

### Regression check

| Check | Result |
|---|---|
| Phase 3 worker unit tests: `vitest run --project worker-node` on admin-events, c-uploads, case-documents, admin-review, dashboard, admin-requests | 5 files, 63/63 passed |
| Phase 3 web tests: `vitest run --project web` on uploads, mirror-card, review-panel, timeline, dashboard, portal-page, step-list, request-page, lib | 27 files, 237/237 passed |
| Commits since the first verification that touch Phase 3 files | Only the 3 fix commits plus `a2c1882` and `ff63eae` (06-03: an address card on the review panel and the `address.confirmed` timeline label). Both are additive, and the tests above include them. |
| Debt markers (`TBD\|FIXME\|XXX`) in the files the fixes changed | none |
| File sizes of the files the fixes changed | all ≤ 371 lines |
| Companion docs for the files the fixes changed | updated in the same commits (`admin-events.md`, `admin-events.test.md`, `review.md`, `upload-sheet.md`, `copy.md`, `portal-page.md`, `step-list.md`, `portal-api.md`, `mirror-card.md`, `request-page.md`) |

No live PostgREST check was run. The only live suite that touches `listCaseEvents` is `review-live.test.ts`, which seeds rows and only uses a null cursor, so it is neither read-only nor a cursor test. The cursor round trip against the deployed Worker is listed as a post-deploy human check.

### Still open (not gaps)

- Truth 1b: the live TUS resume after a reload. This is behavior-unverified and routed to a human.
- The D-06 wording decision.
- The browser and phone checks in `human_verification`.
- The 17 judgment-tier prohibitions. The LLM verdict still holds after the fixes.
- Earlier warnings, unchanged:
  - `createUploadingDocument` writes `in_progress` with no `request_apply_status`, which is tied to D-06.
  - A finished TUS upload whose `complete` never ran leaves an orphaned `uploading` row.
  - 9 Phase 3 test files have no companion doc.
- ℹ️ New info:
  - `request-page.tsx` renders the full-page "Couldn't load this request" whenever `detail.isError`. Now that the page polls every 5 s, a Worker outage that lasts through the 3 prod retries replaces the page until the next successful poll. Before, this only happened on a window-focus refetch. A fix would be `if (detail.isError && !detail.data)`, but it is not required for the goal.
  - The mirror's `last_error` stays on the latest upload code until the client reloads, even after a successful retry. That matches "the last error the client hit".

_Re-verified: 2026-10-11T15:45:00Z_
_Verifier: Claude (gsd-verifier)_
