# `app/worker/src/storage/case-documents.ts`

The Worker's only access to Supabase Storage (Plan 03-01; D-01, D-02, D-03, D-05). Every call uses `createAdminClient(env)` (the secret key), created per call and never at module scope. The Worker mints tokens and URLs and reads at most 16 bytes of an object; client file bytes never pass through it (C14).

## Exports

| Export | What it does |
|--------|--------------|
| `BUCKET` | `'case-documents'`, the private bucket created by migration 0004. |
| `ACCEPTED_MIMES` / `AcceptedMime` | `application/pdf`, `image/jpeg`, `image/png`. HEIC is converted to JPEG in the browser before upload (D-02), so it is never stored. |
| `MAX_BYTES` | 26,214,400 (25 MiB), the same as the bucket's `file_size_limit`. |
| `MAX_FILES_PER_ITEM` | 10 files per request item (D-02). |
| `safeName(name)` | Makes a client file name safe for a path: NFC-normalizes, keeps only the last path segment (so `../../etc/passwd` becomes `passwd`), replaces anything outside `A-Z a-z 0-9 . _ -` with `_`, collapses runs of `_`, strips leading dots, caps at 80 characters, and returns `file` if nothing is left. |
| `objectPath(p)` | `firm/{firm_id}/case/{case_id}/item/{request_item_id}/{document_id}/{safeName(name)}` (D-01). Every id comes from the cookie session and the server-generated document id; the client controls only the sanitized name. A fresh document id per upload means two uploads to one item never share a path. Changing this layout later means moving objects and rewriting `documents.storage_key`. |
| `sniffType(bytes)` | Magic-byte check (D-03): `%PDF-` → PDF, `FF D8 FF` → JPEG, `89 50 4E 47` → PNG, anything else (including fewer bytes than the signature) → `null`. |
| `signedUploadToken(env, path)` | `createSignedUploadUrl(path)` → `{ token, path, signedUrl }`. The browser PUTs to `signedUrl` (or uses `token` as `x-signature` on the TUS endpoint). Tokens expire after 2 hours on the server. Throws `storage_sign_failed`. |
| `headBytes(env, path, n = 16)` | Signs a 60-second read URL and fetches it with `range: 'bytes=0-15'`. Results: sign error "not found" or a 400/404 response → `null` (the object is missing, so the upload did not finish); 416 (an empty object) → empty bytes and size 0, which then fail the magic-byte check; 206 → the bytes and the total size from `Content-Range`. Any other status throws `storage_read_failed`. The live test confirmed Storage answers 206 (`bytes 0-15/1024`), so the planned 200 fallback branch was removed and the read fails closed. |
| `signedReadUrl(env, path, opts)` | `createSignedUrl(path, expiresIn ?? 300, { download } if set)`. Five-minute default (D-05). Used by Plan 03's Preview/Download. |
| `removeObject(env, path)` | `remove([path])`. Used when a finished upload fails the type or size check. Throws `storage_remove_failed`. |

## Tests

- `app/worker/test/uploads.test.ts` (live): mint, PUT, complete, mismatch delete, and the 206 check.
- `app/worker/src/storage/case-documents.test.ts` (unit): `safeName` (`../../etc/passwd` → `passwd`, `My Statement (Jan).PDF` → `My_Statement_Jan_.PDF`, `.hidden` → `hidden`, empty and dots-only → `file`, 80-character cap), the exact `objectPath` with no `..`, and `sniffType` for PDF, JPEG, PNG, `GIF89a`, 3 bytes and an empty array.
