# `app/worker/src/storage/connection-files.ts`

Stores provider-fetched files (Truv now, Plaid statements in Plan 04-04) in the private `case-documents` bucket with a `documents` row (D-06).

## Path layout

`providerObjectPath(p)` gives `firm/{firm}/case/{case}/item/{item}/{bank|payroll}/{safeName(group)}/{safeName(name)}`.

- Ids come from the connection row; `group` and `name` go through `safeName`, which removes path separators, so `..` cannot traverse.
- Client uploads use `.../item/{item}/{document_id}/{name}` (Phase 3), so a provider file and a manual upload on the same item never share a path.

`employerSlug(companyName, employerId)` gives the payroll group: the lowercased company name with runs of non-alphanumerics turned into `-` (or `employer` when null or empty), then `-<employer_id>`. The company part is shortened so the whole slug is at most 60 characters; the employer id suffix is never cut, because `connections-ops.ts` attributes files to employers by the `-<employer_id>` ending. Two employers with the same company name get different folders.

## `storeProviderFile(env, p)`

1. Build the path. If a `documents` row already has that `storage_key`, return `{ created: false }` without reading bytes.
2. `p.bytes` may be an `ArrayBuffer` or a loader; a loader runs only now, so a rerun downloads nothing that is already stored.
3. Magic bytes (`sniffType`) must equal `p.mime`, else `Error('bad_file_type')` and nothing is written (T-04-14).
4. `storage.upload(path, bytes, { contentType: mime, upsert: false })`; an "already exists" error is tolerated (a crash after upload and before the row).
5. Insert `documents` `{ id, case_id, request_item_id, connection_id, storage_key, original_filename, mime_type, document_type, size_bytes, sha256, status: 'ready', uploaded_by_actor }`. `sha256` is computed when not given.
6. A unique violation on `storage_key` (`23505`, a concurrent writer) re-reads the winner and returns `{ created: false }`.

## Tests

`connection-files.test.ts` (admin client mocked): slugs, the long-name rule, the path layout without `..`, an existing row (no upload, loader not called), non-PDF bytes declared as PDF, a fresh path (upload options and the inserted row), and the concurrent-writer case.
