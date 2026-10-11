# `supabase/migrations/0004_uploads_review.sql`

Phase 3 data foundation (03-CONTEXT D-01, D-03..D-07; Plan 03-01). It extends the baseline `documents` table for client uploads, creates the private Storage bucket `case-documents`, adds `request_status()` (the single source of truth for `requests.status`), the three state-changing RPCs `upload_complete`, `item_approve` and `item_reject`, and the staff dashboard view `request_dashboard_v`. It was applied to the live project `zvkphuikjpwoauqdimcf` with `node app/scripts/db-migrate.mjs`, which recorded it in `public.app_migrations`.

The file is additive only. It drops, renames, or retypes nothing. Every statement can run again safely (`IF NOT EXISTS`, `OR REPLACE`, `ON CONFLICT DO NOTHING`, idempotent `REVOKE`/`GRANT`).

## D-04 column reconciliation

D-04 listed `storage_path` and `mime` as new columns. The baseline table already has the same facts under other names, so no duplicate columns were added:

| D-04 name | Column used | Meaning |
|-----------|-------------|---------|
| `storage_path` | `storage_key` (`TEXT NOT NULL UNIQUE`, baseline) | The Storage object path in bucket `case-documents`. |
| `mime` | `mime_type` (`TEXT NOT NULL`, baseline) | The type the client declared, verified by magic bytes before the row becomes `ready`. |

## Sections

| Lines | What it does |
|-------|--------------|
| 1-17 | Header: additive only; what `storage_key` and `mime_type` hold; NULL `size_bytes`/`sha256` means "not finalized"; status is derived by `request_status()` only; the Worker is the only reader and writer. |
| 19, 275 | `BEGIN;` / `COMMIT;`. The Management API runs the file as one query, so the migration is all-or-nothing. |
| 21 | `documents.id` gets the default `gen_random_uuid()`. The baseline had none. The Worker still supplies its own id, because the id is part of the object path. |
| 23-30 | New `documents` columns: `request_item_id` (FK → `request_items`, `ON DELETE SET NULL`, so deleting a request never deletes a document row), `size_bytes`, `sha256` (hex, computed by the client), `status` (`uploading`, `ready`, `rejected`, `deleted`; default `uploading`), `uploaded_by_actor` (`client:<link id>`), `rejection_note`. There were 0 rows when it was applied. |
| 32 | `documents_request_item_id_idx (request_item_id, uploaded_at, id)`: serves the per-item list in its stable order (`uploaded_at ASC, id ASC`). |
| 33 | `events_request_created_idx (request_id, created_at DESC)`: serves the view's `last_activity_at` and Phase 3's timeline. |
| 35-40 | The bucket, created by SQL (`INSERT INTO storage.buckets ... ON CONFLICT (id) DO NOTHING`): private, `file_size_limit` 26214400 (25 MiB, D-02), `allowed_mime_types` `application/pdf`, `image/jpeg`, `image/png`. No `storage.objects` policies and no grants: the Worker's secret key is the only Storage principal. The browser uploads only through a Worker-minted signed upload token bound to one path. The admin-client fallback (`createBucket`) was not needed. |
| 42-79 | `request_status(p_request_id) → text`, `LANGUAGE sql STABLE`. One `SELECT` over the request with a `CROSS JOIN LATERAL` aggregate of its items: `n_items`, `n_required`, `n_required_open` (required and not approved), `n_open` (not approved), `n_submitted`, `n_active` (`in_progress`, `submitted`, or `rejected`). Branches, first match wins: `draft`/`revoked` are kept as they are; `complete` when there is at least one item, no required item is open, and either a required item exists or every item is approved (so a request with no items is never complete, and one with only optional items is complete only when all are approved); `waiting_on_staff` when any item is `submitted`; `in_progress` when opened and any item is active; `opened`; `sent`; otherwise `draft`. |
| 81-97 | `request_apply_status(p_request_id) → text`. Writes `request_status()` into `requests.status`. `completed_at` is set to `now()` the first time the request becomes `complete` and kept while it stays complete; it is cleared when the request leaves `complete` (for example after a rejection). |
| 99-101 | The lock order every RPC follows: the `requests` row, then the `request_items` row, then `documents` rows. 0003 also locks `requests` first, so concurrent calls on one request queue up instead of deadlocking, and the last writer recomputes the status. |
| 103-155 | `upload_complete(p_document_id, p_request_id, p_size_bytes, p_sha256, p_actor_id) → jsonb`. First an unlocked lookup proves the document belongs to an item of `p_request_id` (else `document_not_found`). Then it locks request, item, document. A document that is already `ready` returns `{document_status, item_status, request_status, already: true}` and writes nothing. A status other than `uploading` raises `document_not_uploading`. Otherwise it sets the document `ready` with size, hash and `uploaded_at = now()`, sets the item `submitted` and clears its rejection note, logs `document.uploaded` (actor `client`, payload `document_id`, `request_item_id`, `size_bytes`, `mime_type`), re-applies the request status, and returns the new statuses. |
| 157-194 | `item_approve(p_item_id, p_firm_id, p_actor_id) → jsonb`. Staff only (called by Plan 03). An item outside `p_firm_id` raises `item_not_found`. An already-approved item returns `already: true` and writes nothing. An item that is not `submitted` or `rejected` raises `item_not_submitted`. Otherwise: status `approved`, note cleared, `item.approved` logged, status re-applied. This is the only path that approves an item, so only staff can complete a request. |
| 196-237 | `item_reject(p_item_id, p_firm_id, p_note, p_actor_id) → jsonb`. An empty or blank note raises `note_required`. The same firm check. Allowed from `submitted`, `approved` or `rejected` (else `item_not_submitted`). Sets the item `rejected` with the trimmed note, marks the item's `ready` documents `rejected` with the same note, logs `item.rejected` with label and note, and re-applies the status (a complete request goes back to `in_progress` and loses `completed_at`). |
| 239-254 | `request_dashboard_v`, `security_invoker = true` so it never bypasses RLS. One row per request with the case's name and email, the latest link's `expires_at`, `last_activity_at` (newest event for the request), and `overdue` (sent 3 or more days ago and not `complete` or `revoked`, D-07). `created_at` and `expires_at` are kept because Phase 2's request list already returns them. |
| 256-258 | Why the grants block exists: views bypass RLS unless `security_invoker`, and functions are executable by `PUBLIC` by default (the Phase 1 default-privilege revoke does not cover `PUBLIC`). |
| 259-264 | `REVOKE ALL` on the view from `anon`/`authenticated`; `REVOKE EXECUTE` on all five functions from `PUBLIC`, `anon`, `authenticated`. |
| 265-271 | Explicit `GRANT SELECT` on the view and `GRANT EXECUTE` on the five functions to `service_role` (the 01-04 pattern), so the Worker never depends on an implicit grant. |
| 273 | `NOTIFY pgrst, 'reload schema'` so PostgREST sees the new RPCs and the view at once. |

## Error tokens

Each RPC raises a bare token with SQLSTATE `P0001`: `document_not_found`, `document_not_uploading`, `item_not_found`, `item_not_submitted`, `note_required`. `app/worker/src/db/documents.ts` maps the first two; Plan 03's review module maps the rest.

## Verification

- `node app/scripts/db-migrate.mjs --status` lists `0004_uploads_review`; `--dry-run` prints `0 pending`.
- Bucket query: 1 private bucket with limit 26214400; 5 functions; 6 new columns; 0 `PUBLIC`/`anon`/`authenticated` routine grants; 0 `anon`/`authenticated` table grants.
- `app/worker/test/uploads.test.ts` proves `upload_complete` live; `app/worker/test/rls.test.ts` proves `anon` gets 401 `42501` on the view. The full `request_status()`/approve/reject matrix is Plan 03-07.
