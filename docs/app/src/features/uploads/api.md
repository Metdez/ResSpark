# `app/src/features/uploads/api.ts`

Typed calls to the four client upload routes from Plan 03-01. Every call goes through Phase 2's `portalFetch` (`@/features/client-portal/portal-api`), which sends the `rs_client` cookie (`credentials: 'same-origin'`) and the `X-Requested-With: ResSpark` header the Worker's `requireClientHeader` demands on POSTs. Nothing here imports `@/lib/api` (the staff bearer wrapper) or `@/lib/supabase`, so the module is safe in the `/c/*` bundle.

## Types

| Type | Shape |
|------|-------|
| `MintResponse` | `{ document_id, path, token, signed_url }`. `token` is the signed upload token for one object path; `signed_url` is the same token as a full Storage URL for a simple `PUT`. |
| `ItemDocument` | `{ id, name, mime, size_bytes (number or null), status ('ready' or 'rejected'), uploaded_at }`. |
| `ItemDocuments` | `{ item: { id, label, status, rejection_note }, documents: ItemDocument[] }`. `rejection_note` is where the sheet reads the agent's note; Phase 2's `/api/c/state` steps carry no note. |
| `CompleteResponse` | `{ document_status, item_status, request_status }`. |

## Guards

`isMintResponse`, `isCompleteResponse`, `isDocument` and `isItemDocuments` check every field the sheet reads. A 200 body that fails its guard makes `portalFetch` throw `PortalError(500, 'invalid_response')`; untrusted JSON is never cast. `post(body?)` builds `{ method: 'POST', body: JSON.stringify(body) }` (no body for the token route).

## Functions

| Function | Route | Notes |
|----------|-------|-------|
| `mintUpload(itemId, { name, mime, size })` | `POST /api/c/items/:itemId/uploads` | 201. Creates an `uploading` document row and a token. Errors: `unsupported_type`, `file_too_large`, `item_not_upload`, `item_approved`, `too_many_files`, `not_found`. |
| `remintToken(documentId)` | `POST /api/c/uploads/:documentId/token` | A fresh token for the same object, used to resume after a reload. 409 `document_not_uploading` when the document is no longer waiting. |
| `completeUpload(documentId, { sha256, size })` | `POST /api/c/uploads/:documentId/complete` | The Worker checks the stored bytes. Errors: `upload_incomplete`, `bad_file_type` and `file_too_large` (the object and row are deleted), `document_not_uploading`. |
| `listItemDocuments(itemId)` | `GET /api/c/items/:itemId/documents` | Ready and rejected documents in `uploaded_at, id` order, plus the item's status and rejection note. |

Errors reach the sheet as `PortalError { status, code }`; `copy.ts` turns the code into a sentence.

## Tests

`api.test.ts` stubs `fetch` and checks that a mint posts to the right path with `credentials: 'same-origin'`, `X-Requested-With: ResSpark` and the file facts; that an error envelope surfaces its `code`; that a malformed documents list rejects with `invalid_response`; and that `errorCopy` maps a known code and falls back for an unknown one (including `toString`, which must not hit `Object.prototype`).
