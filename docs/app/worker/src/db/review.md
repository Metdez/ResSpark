# `app/worker/src/db/review.ts`

Firm-scoped reads and decision calls behind the staff review routes (Plan 03-03; D-05, D-06, D-09, D-10, UPL-03, UPL-04). Every function creates its own service-role client with `createAdminClient(env)`; there is no module-level connection. Postgres error text never leaves this file: reads throw a fixed `Error` code (which `app.onError` turns into a 500), and the two RPC wrappers throw a `ReviewError`.

## Types

| Type | Fields | Used by |
|------|--------|---------|
| `ReviewRequest` | `id`, `firm_id`, `case_id`, `status`, `sent_at`, `opened_at`, `completed_at`, `agent_display_name`, `template_name` | `GET /requests/:id/review` → `request` |
| `ReviewDocument` | `id`, `name` (the stored `original_filename`), `mime` (`mime_type`), `size_bytes`, `status` (`ready` or `rejected`), `uploaded_at`, `rejection_note` | nested in each item |
| `ReviewItem` | `id`, `position`, `kind`, `label`, `required`, `status`, `rejection_note`, `documents` | `items[]` |
| `ClientSessionView` | `last_step`, `last_error`, `seen_at` | `client_session` (Plan 03-05 renders it) |
| `EventRow` | `id`, `actor_type`, `actor_id`, `action`, `payload`, `created_at`, `request_id` | `GET /cases/:id/events` |
| `ReviewError(code, status)` | an `Error` whose `message` is `code`, plus the HTTP status the route should answer with | `admin-review.ts` maps it to the error envelope |

## Functions

| Function | Query | Notes |
|----------|-------|-------|
| `getFirmRequest(env, firmId, requestId)` | `requests` where `id` and `firm_id` match, `maybeSingle()` | `null` for a missing or foreign request; the route answers 404 for both (T-03-12). |
| `listItemsWithDocuments(env, requestId)` | One PostgREST select on `request_items` with the embedded `documents(...)` relation | Items ordered `position, id`; embedded documents filtered to `status in ('ready','rejected')` and ordered `uploaded_at, id` through `referencedTable: 'documents'`. Equal timestamps therefore keep a stable order across polls (UPL-03 ordering edge). The filter on the embedded table filters the documents, not the items, so an item with no files still comes back with `documents: []`. Rows are mapped to the `name`/`mime` field names the SPA uses. Only called after `getFirmRequest` has proved the request is the staff member's firm's. |
| `getLatestClientSession(env, requestId)` | `client_sessions` inner-joined to `client_links` on `request_id`, ordered `seen_at` descending, `limit(1)` | `null` when the client never opened any link of the request. Regenerated links each have their own session row, so the newest one wins. |
| `findFirmDocument(env, firmId, documentId)` | `documents` inner-joined through `request_items` to `requests`, filtered on `requests.firm_id` | `documents` has no `firm_id` column; the two `!inner` joins make the firm filter drop a foreign document entirely. Returns the full `DocumentRow` plus `firm_id` and `request_id` (the route needs both for the `document.viewed` event). |
| `approveItem(env, firmId, itemId, actorId)` | `rpc('item_approve', { p_item_id, p_firm_id, p_actor_id })` | The RPC (migration 0004) re-checks the firm, locks `requests` then the item, writes `item.approved`, and recomputes the request status in the same transaction. It is idempotent on an already approved item (`already: true`, no second event). |
| `rejectItem(env, firmId, itemId, note, actorId)` | `rpc('item_reject', { p_item_id, p_firm_id, p_note, p_actor_id })` | Sets the item and all of its `ready` documents to `rejected` with the same note, writes `item.rejected` with the note in the payload, and recomputes the request status. |
| `listCaseEvents(env, firmId, caseId, before, limit)` | First `cases` where `id` and `firm_id` match; then `events` where `firm_id` and `case_id` match, rows strictly before the cursor when given (`or(beforeFilter(before))`), ordered `created_at DESC, id DESC`, `limit(limit)` | Returns `null` when the case is not the firm's, so the route can answer 404 instead of an empty page. |

## RPC error mapping

`rpcError` splits `error.message` into words and looks for the bare `RAISE EXCEPTION` tokens of migration 0004:

| RPC token | `ReviewError` code | HTTP |
|-----------|--------------------|------|
| `item_not_found` | `not_found` | 404 |
| `item_not_submitted` | `item_not_submitted` | 409 |
| `note_required` | `note_required` | 400 |
| anything else | `rpc_failed` | 500 |

`item_not_found` is renamed to `not_found` so a foreign item reads exactly like every other missing id.

## Events cursor

`EventCursor` is `{ ts, id }`: the last row's raw Postgres `created_at` string and its `id`. `beforeFilter(cursor)` builds the PostgREST `or()` filter `created_at.lt."ts",and(created_at.eq."ts",id.lt.id)`, which matches the `created_at DESC, id DESC` order exactly. Several events written in one transaction share a timestamp (`CURRENT_TIMESTAMP` is the transaction start), so the id tiebreak is what keeps a page edge inside such a group from skipping rows. `ts` is quoted because it contains `.`, `:` and `+`; the route only lets a strict timestamp shape through, so no filter syntax can reach the string. The raw string keeps microseconds (a `Date` round-trip would truncate to milliseconds and skip rows in the same millisecond).
