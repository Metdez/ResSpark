# Phase 3: Uploads, Review & Live Status - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 makes the request loop complete without any provider: the client uploads files per requested item from a phone (resumable, validated, compressed), staff preview and approve or reject each item with a note, the request completes when every required item is approved, the admin dashboard lists requests with live status (polling), staff see a mirror of the client's current step and last error, and the case view shows the event timeline. Requirements: UPL-01..04, STAT-01..04. Provider connects, webhooks, Logics push, address, and e-sign are later phases.

</domain>

<decisions>
## Implementation Decisions

Discussion ran in `--auto` mode. Recommended options chosen; override here before planning if needed.

### Uploads
- **D-01:** Files go directly from the browser to a private Supabase Storage bucket `case-documents` (created by migration/Management API in this phase) using Worker-minted signed upload tokens: `POST /api/c/items/:itemId/uploads` creates a `documents` row (status `uploading`) and returns `createSignedUploadUrl` output for the path `firm/{firm_id}/case/{case_id}/item/{item_id}/{document_id}/{safe_name}`. Upload uses the resumable TUS endpoint with the signed token if the Phase 1 spike (c) proved it; otherwise `uploadToSignedUrl` with a client-side retry (3 attempts) is the fallback and resumability is "retry from zero". Bytes never touch the Worker (C14). — **Reversibility:** costly — storage path layout is referenced by documents rows and later Logics pushes.
- **D-02:** Client-side preprocessing before upload: images (JPG/PNG) are resized to max 2,000 px on the long edge and re-encoded as JPEG q0.82 with canvas (no library); HEIC/HEIF is converted to JPEG with a lazily imported `heic2any` (MIT) only when the selected file is HEIC; PDFs pass through. Accepted types: PDF, JPG, PNG, HEIC. Max 25 MB per file after processing, 10 files per item.
- **D-03:** Finalize: `POST /api/c/uploads/:documentId/complete` has the Worker read the first 16 bytes of the stored object through a signed range request, verify the magic bytes match the declared type (`%PDF-`, JPEG `FF D8 FF`, PNG `89 50 4E 47`), record `size_bytes` and `sha256` (computed client-side with Web Crypto and re-checked later by the push phase), set `documents.status = ready`, set `request_items.status = submitted`, and log `document.uploaded`. Mismatch deletes the object and returns a clear error.
- **D-04:** The existing baseline `documents` table is reused additively (new columns: `request_item_id`, `storage_path`, `mime`, `size_bytes`, `sha256`, `status` in uploading|ready|rejected|deleted, `uploaded_by_actor`, `rejection_note`); the planner must read `src/schemas/database_schema.sql` for the current columns before writing migration `0004_uploads_review.sql`.

### Review
- **D-05:** Staff case view lists items with their documents; each document has Preview (signed URL, 5-minute expiry, `Content-Disposition: inline` for PDFs/images, opened in a new tab) and Download. Approve sets `request_items.status = approved`; Reject requires a note (presets: "blurry", "wrong document", "missing pages", "need all pages", plus free text) and sets `request_items.status = rejected`, `documents.status = rejected`, and the client's step shows the note with "Upload again". Both actions are RPCs that log `item.approved` / `item.rejected`.
- **D-06:** Request status is derived in SQL: `complete` when every `required` item is `approved`; `waiting_on_staff` when any item is `submitted`; `in_progress` when any item is `in_progress`/`submitted`/`rejected` after open; else `opened`/`sent`. A `request_status(request_id)` SQL function is the single source of truth, called by the RPCs after every transition (UPL-04).

### Dashboard, live status, mirror, timeline
- **D-07:** Dashboard (`/admin`) becomes a TanStack Table of requests: client name, template, status badge (UI-SPEC palette), sent/opened/last activity ages, agent, overdue flag (`sent_at` older than 3 days and not complete), with status filter chips and text search. Data from `GET /api/admin/requests?status=&q=`.
- **D-08:** Live updates by polling: TanStack Query `refetchInterval` 5 s on the dashboard and 5 s on the open request/case view while `document.visibilityState === "visible"`, paused otherwise; no Realtime in v1 (STAT-02).
- **D-09:** Mirror view: the request page shows "Client is on: {last_step} — last seen {ago}" and the last error string from `client_sessions` (Phase 2 heartbeat), refreshed by the same poll; a red "stuck" hint appears when `seen_at` is older than 10 minutes while the request is open and incomplete (STAT-03).
- **D-10:** Timeline: `GET /api/admin/cases/:id/events` returns `events` rows for the case (newest first, paged 50) rendered as a vertical list with actor badges (staff/client/system/provider), action label mapping in `app/src/features/timeline/labels.ts`, and relative times (STAT-04).

### Client step UI
- **D-11:** The upload step is a mobile sheet: a big "Take photo or choose files" control (`input type=file accept="image/*,.pdf,.heic" capture="environment" multiple`), per-file progress bars, a "Done with this item" button that is enabled once at least one file is `ready`, and clear states for rejected items ("Your agent asked for a new copy: {note}"). All targets 44 px; copy per UI-SPEC voice.

### Claude's Discretion
- Exact storage path sanitization, preview viewer (new tab is enough), table column widths, polling backoff on errors.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/phases/01-foundation-staff-sign-in/01-CONTEXT.md`, `01-SKELETON.md`, `01-0[1-8]-PLAN.md` — foundation files and conventions
- `.planning/phases/01-foundation-staff-sign-in/01-UI-SPEC.md` — design system of record (status badges, dense tables, loading/empty/error conventions, client 44 px rule)
- `.planning/phases/02-find-the-client-send-the-link/02-CONTEXT.md` — requests, request_items, client_sessions, `/api/c/*` session middleware this phase extends
- `src/schemas/database_schema.sql` — existing `documents` and `document_extractions` tables (additive changes only)
- `.planning/research/PITFALLS.md` — C14 (Workers limits), M8, M9, M10, M12
- `.planning/research/ARCHITECTURE.md` — storage driver interface, write-through-Worker rule
- `CLAUDE.md`, `.claude/CLAUDE.md`, `.agents/skills/supabase/SKILL.md` (Storage upsert needs INSERT+SELECT+UPDATE; signed URLs; private buckets)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1/2: `clientSession` middleware, `db/` module, `logEvent`, RPC-with-event pattern, request/item tables, heartbeat.
- `src/frontend/src/document-upload/screen.ts` — the old upload slot UI; reuse its slot/label logic conceptually, not its Material Web markup.
- shadcn-admin `data-table` (TanStack Table v8) for the dashboard; `sheet`, `progress`, `badge`, `alert` components.

### Established Patterns
- Every mutation is an RPC that writes its event; status derived in SQL; type guards at API boundaries; companion docs per file; files under 500 lines.

### Integration Points
- `app/worker/src/routes/` (new `c-uploads.ts`, `admin-review.ts`, `admin-dashboard.ts`, `admin-events.ts`), `app/src/features/` (new `uploads`, `review`, `dashboard`, `timeline`), `supabase/migrations/0004_uploads_review.sql`.

</code_context>

<specifics>
## Specific Ideas

- Andrew: "a refresh or a poll that says that person's application link is in progress, and then it's done"; "are you on this step?"; Gather-style per-item approve/reject where "done" is the firm's judgement.
- Demo: upload a synthetic PDF from `examples/` on a phone, approve it on the admin side, watch the dashboard flip to complete within 10 seconds.

</specifics>

<deferred>
## Deferred Ideas

- Supabase Realtime (v2); virus scanning (v2); reminders and stuck alerts beyond the hint (Phase 8); AI classification of uploads (Phase 8).

</deferred>

---

*Phase: 03-uploads-review-live-status*
*Context gathered: 2026-10-10*
