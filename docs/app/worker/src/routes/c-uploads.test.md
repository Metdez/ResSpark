# `app/worker/src/routes/c-uploads.test.ts`

Unit tests for the client upload routes (worker-node project, no network). They call the real `app` from `index.ts` with `app.request()`. Run with `pnpm -C app exec vitest run --project worker-node worker/src/routes/c-uploads.test.ts`.

## Mocks

| Mock | Why |
|------|-----|
| `../db/documents` (auto-mocked) | Every query is a `vi.fn`; `beforeEach` gives the happy-path values (a `pending` upload item, request `C1`, 0 active files, an `uploading` JPEG document, the RPC's `ready/submitted/waiting_on_staff`). |
| `../storage/case-documents` (partial) | `signedUploadToken`, `headBytes`, `removeObject`, `signedReadUrl` are mocked; `safeName`, `sniffType` and the constants stay real, so the magic-byte check is the production one. |
| `../middleware/client-session` (partial) | `clientSession` sets a fixed session (`linkId L1`, `requestId R1`, `firmId F1`); `requireClientHeader` stays real. |

Helpers: `item()` / `doc()` build rows with overrides; `send` adds `X-Requested-With: ResSpark` unless told not to; `mint` / `complete` call the two main routes; `code` reads the error code; `dbCalls()` counts `db/documents` mocks that were called.

## Cases

| Group | Proves |
|-------|--------|
| CSRF header | Mint, complete and token without the header → 403 `bad_origin` and no `db/documents` call. |
| Mint | 201 shape and `signedUploadToken(env, storage_key)`; HEIC → 415, size 0 → 400, 26,214,401 bytes → 413, a 201-character name → 400, an array body → 400, none of which create a document; item of another request → 404; `bank_connect` item → 409 `item_not_upload`; approved item → 409 `item_approved`; 10 active files → 409 `too_many_files` without an insert. |
| Complete | 200 with the RPC statuses and the RPC called with the session's request; bad hash → 400; unknown document → 404; no object → 409 `upload_incomplete` without the RPC; `GIF89a` bytes for a declared JPEG → 422, one `removeObject` with the storage key, one `markDocumentDeleted`, no RPC; already `ready` → 200 `already: true` without the RPC. |
| Token | `ready` document → 409 `document_not_uploading` and no token; `uploading` → 200 with a new token for the same path; unknown → 404. |
| Documents list | 200 with the item (including its rejection note) and the documents mapped to `{ id, name, mime, size_bytes, status, uploaded_at }`; item of another request → 404. |

`Cache-Control: no-store` is asserted on success and error responses (from the `/api/c/*` middleware in `index.ts`).
