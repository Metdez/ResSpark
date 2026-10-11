# `app/worker/src/storage/logics-parts.test.ts`

Unit tests for `logics-parts.ts`. `../db/client` is mocked: `createAdminClient` returns `{ storage: { from } }`, where `from` (a spy) returns the stub methods each case sets through the `bucket(over)` helper.

- `partPath` → `firm/f/case/c/logics/d/part-2.pdf` for part 2.
- `uploadPart` calls `from('case-documents')` and `upload(path, bytes, { contentType: 'application/pdf', upsert: true })`.
- `uploadPart` with `{ error }` rejects with `storage_write_failed`.
- `downloadPart` returns the blob's bytes; with `{ data: null, error }` rejects with `storage_read_failed`.
