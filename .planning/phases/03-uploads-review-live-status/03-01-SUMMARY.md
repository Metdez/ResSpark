---
phase: 03-uploads-review-live-status
plan: 01
subsystem: api
tags: [supabase-storage, postgres, rpc, hono, uploads, magic-bytes]

requires:
  - phase: 01-foundation-staff-sign-in
    provides: migration runner, log_event(), deny-by-default grants pattern, Spike (c) signed upload proof
  - phase: 02-find-the-client-send-the-link
    provides: requests/request_items/client_links tables, clientSession + requireClientHeader middleware, /api/c privacy headers
provides:
  - migration 0004_uploads_review (documents upload columns, private case-documents bucket, request_status(), request_apply_status(), upload_complete/item_approve/item_reject RPCs, request_dashboard_v)
  - app/worker/src/storage/case-documents.ts (path builder, sniff, signed upload token, 16-byte range read, signed read URL, remove)
  - app/worker/src/db/documents.ts (request-scoped documents/items queries + upload_complete call)
  - POST /api/c/items/:itemId/uploads, POST /api/c/uploads/:documentId/complete, POST /api/c/uploads/:documentId/token, GET /api/c/items/:itemId/documents
affects: [03-02 client upload sheet, 03-03 staff review, 03-04 dashboard, 03-07 request_status matrix, 05 Logics push]

actuals:
  tokens: 21000
  tasks: 2
  commits: 8
plan_head_before: 84b39b8c7a5babd29b64eaf5c994632dc79ecffd
plan_head_after: c1aaf36065b34bf792485691c7c0bdb656bf28a3

tech-stack:
  added: []
  patterns:
    - "RPC lock order requests -> request_items -> documents, with an unlocked ownership lookup first"
    - "Route-level session middleware that skips when c.var.client is already resolved (no use('*') on a shared /api/c prefix)"
    - "Error envelope with a readable message returned via c.json (fail helper) where onError would echo the code"

key-files:
  created:
    - supabase/migrations/0004_uploads_review.sql
    - app/worker/src/storage/case-documents.ts
    - app/worker/src/storage/case-documents.test.ts
    - app/worker/src/db/documents.ts
    - app/worker/src/routes/c-uploads.ts
    - app/worker/src/routes/c-uploads.test.ts
    - app/worker/test/uploads.test.ts
    - docs/supabase/migrations/0004_uploads_review.md
    - docs/app/worker/src/storage/case-documents.md
    - docs/app/worker/src/storage/case-documents.test.md
    - docs/app/worker/src/db/documents.md
    - docs/app/worker/src/routes/c-uploads.md
    - docs/app/worker/src/routes/c-uploads.test.md
    - docs/app/worker/test/uploads.test.md
  modified:
    - app/worker/src/index.ts
    - app/worker/test/rls.test.ts
    - docs/app/worker/src/index.md
    - docs/app/worker/test/rls.test.md

key-decisions:
  - "Bucket created by the SQL insert into storage.buckets in 0004 (the Management API accepted it); no admin-script fallback"
  - "Storage answers the signed Range read with 206 (bytes 0-15/1024), so headBytes has no 200 branch and fails closed on any other status; 416 (empty object) is treated as empty bytes and fails the sniff"
  - "D-04 reconciled: storage_path is the existing documents.storage_key, mime is the existing documents.mime_type; no duplicate columns"
  - "Live-test fixtures use test firm 00000000-0000-0000-0000-00000000000e and a fixed permanent case 00000000-0000-0000-0000-0000000000e1 (events.case_id has no ON DELETE, so a case with events cannot be deleted)"
  - "Phase 2 session variable used as c.var.client (ClientCtx); case_id read once from requests via sessionRequest()"
  - "Every RPC locks requests, then request_items, then documents, so concurrent approve/complete serialize and the last writer recomputes status"

patterns-established:
  - "Client upload routes return 404 not_found for malformed or foreign ids before any query (UUID check + request-scoped SQL)"

requirements-completed: [UPL-01, UPL-02, UPL-04]

coverage:
  - id: D1
    description: "Migration 0004 applied and recorded; bucket private with 25 MiB limit and pdf/jpeg/png only; 5 functions; 6 new documents columns; 0 PUBLIC/anon/authenticated grants"
    requirement: UPL-04
    verification:
      - kind: integration
        ref: "node app/scripts/db-migrate.mjs --status / --dry-run (0 pending) and the plan's --query gates (n=1, 5, 6, 0, 0)"
        status: pass
      - kind: integration
        ref: "app/worker/test/rls.test.ts#request_dashboard_v (anon 401 42501)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Mint -> browser PUT to Storage -> complete with magic-byte check sets ready/submitted/waiting_on_staff and one document.uploaded event; repeat complete is a no-op; mismatch deletes the object and the row"
    requirement: UPL-02
    verification:
      - kind: integration
        ref: "app/worker/test/uploads.test.ts (live, 5/5)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Upload guards (kind, approved, 10-file cap, mime, size, name), CSRF 403, uniform 404, token re-mint and item document list"
    requirement: UPL-01
    verification:
      - kind: unit
        ref: "app/worker/src/routes/c-uploads.test.ts + app/worker/src/storage/case-documents.test.ts (32/32)"
        status: pass
    human_judgment: false

duration: 29min
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 01: Upload tracer (schema, Storage, client routes) Summary

**The client can now upload a file straight from the phone to the private `case-documents` bucket. The Worker issues a signed upload token tied to one object path. When the client finishes, the Worker reads the first 16 bytes back (Storage returned 206 to the range read) and checks the file type. One `upload_complete` transaction then marks the document ready, marks the item submitted, writes the event and recomputes the request status from `request_status()`. All of this is proven against the live project.**

## Performance

- **Duration:** 29 min
- **Started:** 2026-10-11T08:22:19Z
- **Completed:** 2026-10-11T08:51:33Z
- **Tasks:** 2 (tracer + TDD)
- **Files modified:** 18 (14 created, 4 modified)

## Accomplishments

- Migration `0004_uploads_review` is applied to `zvkphuikjpwoauqdimcf` and recorded in `app_migrations` (`--dry-run` shows 0 pending).
  - Bucket `case-documents`: private, `file_size_limit` 26214400, allowed types `application/pdf`, `image/jpeg`, `image/png`.
  - New functions: `request_status`, `request_apply_status`, `upload_complete`, `item_approve`, `item_reject`. All are `SECURITY INVOKER` with `search_path ''`. EXECUTE is granted to `service_role` only.
  - View `request_dashboard_v` uses `security_invoker`. `anon` and `authenticated` hold 0 grants on the tables, functions and view.
- The upload routes are live on the deployed Worker (version `d370b591-afec-4ab9-b15d-74e33f2077dc`):
  - The mint route checks the request body, type, size, item kind, approval, and the 10-file cap.
  - The complete route checks the magic bytes and the real size. A mismatch deletes the object and the row.
  - The token route re-issues a token for the same object so an upload can resume.
  - The item document list returns only `ready`/`rejected` rows, ordered by `uploaded_at, id`.
- The live test (`uploads.test.ts`, 5/5) covers 403 without the CSRF header, the mint, the PUT to Storage, the complete step, an idempotent repeat, and the mismatch path. It cleans up after itself: 0 objects and 0 `documents` rows remain.
- `rls.test.ts` now also covers `request_dashboard_v`: `anon` gets 401 `42501`, and the suite passes 28/28.

## Task Commits

1. **Task 1: tracer (migration, storage, db, routes, live test)**: `e27f743` (feat)
2. **Task 2 RED: guard, token and list tests**: `ac4a0bf` (test)
3. **Task 2 GREEN: guards, token re-mint, item list**: `9fd3d9a` (feat)

`commits: 8` is the measured `rev-list` count between `plan_head_before` and `plan_head_after`. The branch was shared, so it includes 5 commits from the concurrent executors for 02-06 and 02-08. This plan made 3 of them.

## Recorded facts (requested by the plan's output section)

- **Bucket creation path:** the SQL `INSERT INTO storage.buckets` inside 0004. `app/scripts/storage-bucket.mjs` was not needed.
- **Range read:** Storage returned `206` with `Content-Range: bytes 0-15/1024`. The planned 200 fallback branch was therefore removed, and the live test asserts 206. The only remaining `shortcut:` is the 10-file count race in `c-uploads.ts`.
- **Phase 2 session variable:** `c.var.client` (`ClientCtx { linkId, requestId, firmId, expiresAt, openedAt }`) from `middleware/client-session.ts`. The middleware is unchanged. `case_id` comes from `sessionRequest()`.
- **D-04 reconciliation:** the planned `storage_path` is `documents.storage_key`, and the planned `mime` is `documents.mime_type`. No duplicate columns were added.
- **Test firm:** `00000000-0000-0000-0000-00000000000e` (`Test firm (automated)`), with permanent case `00000000-0000-0000-0000-0000000000e1`.

## Decisions Made

See `key-decisions` in the frontmatter. The most consequential one is the lock order `requests → request_items → documents`, used in all three RPCs. Each RPC first does an unlocked ownership lookup, so two RPCs on the same request wait for each other instead of deadlocking. The plan called for a single joined `FOR UPDATE` instead; in that form the lock order depends on the query plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The live test could not delete its case**
- **Found during:** Task 1 (test design)
- **Issue:** The plan's `afterAll` deleted the `cases` fixture row. `events` is append-only and `events.case_id` has no `ON DELETE`, so after `document.uploaded` is logged that delete fails with an FK error.
- **Fix:** The test uses a fixed, permanent case `...0000e1` under the test firm (upserted). Only objects, documents and the request are deleted; the request cascades to its items, link and session.
- **Files modified:** `app/worker/test/uploads.test.ts`
- **Commit:** `e27f743`

**2. [Rule 1 - Bug] Every `/api/c/*` request was logged as route `/api/c/*`**
- **Found during:** Task 1 (regression run of `client-portal.test.ts`)
- **Issue:** `cUploadsRoute.use('*', clientSession)` also matched `clientPortalRoute`'s paths, and the logger's `routePath(c, -1)` recorded `/api/c/*` instead of `/api/c/state`. That broke Phase 2's log test, and it would have resolved the cookie twice per request.
- **Fix:** A per-route `session_` middleware that runs `clientSession` only when `c.var.client` is not already set.
- **Files modified:** `app/worker/src/routes/c-uploads.ts`
- **Commit:** `e27f743`

**3. [Rule 2 - Missing critical] Deadlock-safe lock order in the RPCs**
- **Found during:** Task 1
- **Issue:** The planned `SELECT … JOIN … FOR UPDATE` locks rows in an order that depends on the query plan. `item_approve` locks item and request, while `upload_complete` locks document, item and request. Run concurrently, the two could deadlock.
- **Fix:** Each RPC first does an unlocked ownership lookup, then locks requests, then the item, then the documents. That matches 0003's rule of locking the requests row first.
- **Files modified:** `supabase/migrations/0004_uploads_review.sql`
- **Commit:** `e27f743`

**4. [Rule 2 - Missing critical] Explicit grants to `service_role` on the 5 functions and the view**
- **Issue:** The plan revoked EXECUTE from PUBLIC but did not grant it back. Without a grant, the Worker would depend on default ACLs (the 01-04 lesson).
- **Fix:** Added `GRANT EXECUTE … TO service_role` and `GRANT SELECT ON request_dashboard_v TO service_role`.
- **Commit:** `e27f743`

**5. [Rule 2 - Missing critical] Malformed ids, empty objects and RPC races on the upload routes**
- **Issue:** A non-UUID `itemId`/`documentId` would make Postgres raise a cast error, which surfaced as a 500. An empty stored object returns 416 to the range read, which also surfaced as a 500. A document deleted or completed between the read and the RPC lock also produced a 500.
- **Fix:**
  - A UUID check returns the uniform 404 before any query.
  - `headBytes` maps 416 to empty bytes, so the file fails the sniff and gets a 422.
  - The RPC tokens `document_not_found` and `document_not_uploading` map to 404 and 409.
  - `complete` on a `rejected`/`deleted` document returns 409 `document_not_uploading`.
- **Files modified:** `app/worker/src/routes/c-uploads.ts`, `app/worker/src/storage/case-documents.ts`
- **Commits:** `e27f743`, `9fd3d9a`

**6. [Rule 3 - Blocking] Error messages bypass `app.onError`**
- **Issue:** `app.onError` writes the error code as the message, but the plan requires readable messages, for example `That file is not a PDF or photo. Try again.`
- **Fix:** A local `fail(c, status, code, message)` helper sets `errorCode` (so the logger still records it) and returns the envelope directly. Global error handling is unchanged.
- **Commit:** `e27f743`

**7. [Scope] `rls.test.ts` gained `request_dashboard_v`**
- The plan assigns the view's PostgREST denial proof to Plan 07. The orchestrator asked for the new view to be added to the hard-coded list now, so it was added as one line (28/28 pass). Plan 07 still owns the RPC denial probes.

**Total deviations:** 6 auto-fixed (2 bugs, 3 missing-critical, 1 blocking) plus 1 orchestrator-directed scope addition. **Impact:** the API surface is unchanged. The deviations add correctness and concurrency safety.

## Issues Encountered

- `pnpm -C app run check` first failed in `app/src/features/client-portal/*`, the RED tests of the concurrent 02-08 executor (not this plan's files). After waiting and re-running, `check` passed on the whole tree: 47 files and 758 tests passed, 6 files and 58 tests skipped, exit 0. The single deploy ran only after that.
- That deploy bundled the working tree as it was at the time, including 02-08's uncommitted but green SPA files.

## Verification

- `node app/scripts/db-migrate.mjs --status` lists `0004_uploads_review`; `--dry-run` prints `0 pending:`.
- Plan query gates: bucket n=1, functions n=5, columns n=6, routine grants to PUBLIC/anon/authenticated n=0, anon/authenticated table grants n=0.
- `pnpm -C app run test:live:file worker/test/uploads.test.ts`: 5/5. The full `pnpm -C app run test:live`: 14 files, 212/212.
- `pnpm -C app exec vitest run --project worker-node worker/src/routes/c-uploads.test.ts worker/src/storage/case-documents.test.ts`: 32/32.
- `node app/scripts/check-file-sizes.mjs` exits 0. `c-uploads.ts` is 169 lines.
- `pnpm -C app run check`: exit 0.
- `pnpm -C app run deploy`: version `d370b591-afec-4ab9-b15d-74e33f2077dc`. Deployed probe: `POST /api/c/items/<uuid>/uploads` with no cookie returns 401 `no_session` with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex`.
- Storage cleanup: 0 objects in `case-documents` and 0 `documents` rows after the runs.

## Known Stubs

None.

## Next Phase Readiness

- Plan 02 (client upload sheet) can call `mint → PUT/TUS → complete`, `token`, and `documents`, using the response shapes in `<interfaces>`.
- Plan 03 can call `item_approve` / `item_reject` and needs to map `item_not_found`, `item_not_submitted`, and `note_required`. Plan 04 reads from `request_dashboard_v`.
- Plan 07 owns the live `request_status()`/approve/reject matrix and the RPC denial probes.
- Watch: `upload_complete` sets an item that is already `approved` back to `submitted` when a document minted before the approval is completed after it. This follows the plan's RPC spec. Staff then re-review the item.

## Self-Check: PASSED

- All 14 created files exist on disk.
- Commits `e27f743`, `ac4a0bf`, and `9fd3d9a` are ancestors of HEAD.
- Every acceptance criterion of both tasks passed when re-run (logged PASS above).
