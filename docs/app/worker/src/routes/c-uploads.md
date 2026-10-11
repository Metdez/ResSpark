# `app/worker/src/routes/c-uploads.ts`

The client upload API (Plan 03-01; D-01, D-02, D-03, UPL-01, UPL-02), mounted in `index.ts` with `app.route('/api/c', cUploadsRoute)` next to Phase 2's `clientPortalRoute`. Identity is the `rs_client` cookie only (`c.var.client` from Phase 2's `clientSession`). File bytes go from the browser straight to Storage; this route mints signed upload tokens and checks the first 16 bytes after the upload (C14).

## Contract

| Route | Guard | Success | Errors |
|-------|-------|---------|--------|
| `POST /api/c/items/:itemId/uploads` body `{ name, mime, size }` | cookie + `X-Requested-With: ResSpark` | 201 `{ document_id, path, token, signed_url }` | 400 `bad_request`, 401 `no_session`, 403 `bad_origin`, 404 `not_found`, 413 `file_too_large`, 415 `unsupported_type` |
| `POST /api/c/uploads/:documentId/complete` body `{ sha256, size }` | cookie + `X-Requested-With: ResSpark` | 200 `{ document_status: 'ready', item_status, request_status }` (plus `already: true` when it was already ready) | 400, 401, 403, 404, 409 `upload_incomplete`, 409 `document_not_uploading`, 413 `file_too_large`, 422 `bad_file_type` |

Error bodies are `{ error: { code, message } }` with a plain sentence as `message` (for example 422 → `That file is not a PDF or photo. Try again.`). The SPA shows its own copy keyed by `code`. Every response carries `Cache-Control: no-store`, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer` from the `/api/c/*` middleware in `index.ts`.

## Code

| Part | What it does |
|------|--------------|
| `Env_` / `Ctx` | Hono types: `Env` bindings, `c.var.client` (Phase 2 `ClientCtx`), and `errorCode` for the logger. |
| `SHA256`, `UUID` | Shape checks: a 64-character lowercase hex hash; a UUID path parameter. A malformed id gets the same 404 as an unknown one, and never reaches Postgres (where it would be a cast error). |
| `fail(c, status, code, message)` | Sets `errorCode` for the request logger and returns the error envelope. It returns rather than throws because `app.onError` writes the code as the message, and these routes need a readable sentence. |
| `badRequest`, `notFound` | The 400 and the uniform 404 (another request's item or document reads exactly like a missing one, T-03-05). |
| `isObject`, `isCount` | Type guards for the JSON body: a plain object; an integer of at least 1. |
| `session(c)` | `{ link_id, request_id, firm_id }` from the cookie session. |
| `session_` | Runs `clientSession` unless the session is already resolved, and is the first handler of every route in this file. `clientPortalRoute`'s own `'*'` middleware also matches `/api/c/*` and runs first, so without the check the cookie and link row would be looked up twice. It is attached per route, not with `use('*')`: a `'*'` here would also match `clientPortalRoute`'s paths and become the route pattern the logger records for them. |
| `POST /items/:itemId/uploads` | `requireClientHeader` first (403 `bad_origin`, nothing read or written). Then, first failure wins: body not an object, `name` not 1-200 characters, `mime` not a string, or `size` not an integer ≥ 1 → 400; `mime` not PDF/JPEG/PNG → 415; `size` over 25 MiB → 413; item not in the session's request → 404; request gone → 404. Then `createUploadingDocument` (status `uploading`, path from `objectPath`) and `signedUploadToken` for that exact path → 201. |
| `POST /uploads/:documentId/complete` | `requireClientHeader`, then the body (`sha256` hex-64, `size` integer ≥ 1) → else 400. Document not in the session's request → 404. Already `ready` → 200 with the current item and request statuses and `already: true`; no RPC, no event. Any status other than `uploading` → 409 `document_not_uploading`. Then `headBytes`: no object → 409 `upload_incomplete` (the row stays `uploading`, so the next call after a finished upload completes it). Magic bytes that do not match the declared `mime_type` → the object is removed, the row marked `deleted`, 422 `bad_file_type`. The real size (from Storage's `Content-Range`, else the body's `size`) over 25 MiB → removed, `deleted`, 413. Otherwise `completeUpload` (the `upload_complete` RPC) → 200. If a concurrent call changed the row between the read and the RPC's lock, the RPC's `document_not_found` → 404 and `document_not_uploading` → 409. |

## Logging

No `console.log` is added. The Phase 1 logger records only the allow-listed fields and `errorCode`; the file name, hash, token and path never reach a log line (T-03-04).

## Tests

- `app/worker/test/uploads.test.ts` (live): 403 without the header, mint, PUT to Storage, complete, idempotent second complete, mismatch delete.
- `app/worker/src/routes/c-uploads.test.ts` (unit, Task 2).
