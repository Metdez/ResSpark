# `app/worker/src/db/documents.ts`

Request-scoped access to `documents` and `request_items` for the client upload routes, plus the call to the `upload_complete` RPC (Plan 03-01; D-01, D-03, D-04). Every query uses `createAdminClient(env)` (service role), so scoping is done in the query itself: every lookup filters by the cookie session's request in SQL, never in JavaScript after a broad read (T-03-05).

## Types

| Type | Meaning |
|------|---------|
| `SessionCtx` | `{ link_id, request_id, firm_id, case_id }`. The route builds the first three from `c.var.client` (the Phase 2 `ClientCtx`). The cookie has no case id, so `case_id` is read once with `sessionRequest` when a document is created. Functions that need only some fields take a `Pick<SessionCtx, …>`, so a full `SessionCtx` is always accepted. |
| `ItemRow` | One `request_items` row: `id, request_id, position, kind, label, required, status, rejection_note, config`. |
| `DocumentRow` | One `documents` row: `id, case_id, request_item_id, storage_key, original_filename, mime_type, size_bytes, sha256, status, uploaded_at, rejection_note`. `storage_key` is the Storage path and `mime_type` the declared type (the D-04 reconciliation; see the migration doc). |

## Functions

| Function | What it does |
|----------|--------------|
| `sessionRequest(env, requestId, firmId)` | `case_id` and `status` of the session's request, filtered by id and firm. `null` if the request is gone. |
| `findSessionItem(env, s, itemId)` | The item with `id = itemId AND request_id = s.request_id`, or `null`. An item of another request reads exactly like a missing one. |
| `countActiveDocuments(env, itemId)` | Count of the item's documents in `uploading` or `ready` (a head-only exact count). Used for the 10-files-per-item cap. |
| `createUploadingDocument(env, s, item, input)` | Generates the document id (`crypto.randomUUID()`), builds `storage_key` with `objectPath`, and inserts the row with `status: 'uploading'`, `uploaded_by_actor: 'client:<link id>'` and `document_type` = the item's `config.doc_code` (the 0003 templates' key), else `config.code`, else the item label. If the item was `pending` it moves to `in_progress`; the update is guarded by `status = 'pending'` so it never overwrites a newer status. No event is written here; the Phase 2 heartbeat already records where the client is. Throws `document_insert_failed` / `item_update_failed`. |
| `findSessionDocument(env, s, documentId)` | The document joined `!inner` to `request_items` with `request_items.request_id = s.request_id`, so a document of another request returns `null`. The join column is stripped before returning. |
| `listItemDocuments(env, itemId)` | The item's `ready` and `rejected` documents ordered `uploaded_at ASC, id ASC` in SQL, so equal timestamps keep a stable order. `uploading` rows (an interrupted upload) and `deleted` rows are never listed. |
| `markDocumentDeleted(env, documentId)` | Sets `status = 'deleted'` after the object was removed for a failed type or size check. The row is kept as a record. |
| `completeUpload(env, s, documentId, size, sha256)` | `rpc('upload_complete', { p_document_id, p_request_id, p_size_bytes, p_sha256, p_actor_id: 'client:<link id>' })`. Returns `{ document_status, item_status, request_status, already? }`. RPC errors become `document_not_found`, `document_not_uploading`, or `complete_failed`; Postgres text never leaves the function. |

## Tests

`app/worker/test/uploads.test.ts` exercises every function except `countActiveDocuments` and `listItemDocuments` against the live project. The route unit tests (`app/worker/src/routes/c-uploads.test.ts`) mock this module and cover how the routes use those two: the 10-file cap (`countActiveDocuments` ≥ 10 → 409 `too_many_files`) and the `GET /items/:itemId/documents` mapping.
