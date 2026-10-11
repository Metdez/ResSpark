# `app/worker/src/storage/logics-parts.ts`

Storage helpers for the Logics push parts (D-06). Parts are PDFs the Worker writes once, during normalization of part 0, so every later send of the same part (a sibling message, a staff re-send) reads byte-identical data.

## Exports

- `partPath({ firm_id, case_id, document_id, part_index })` → `firm/{firm_id}/case/{case_id}/logics/{document_id}/part-{part_index}.pdf`. Built from ledger ids only; it sits beside the document's own `item/` prefix in the same private `case-documents` bucket, which has no policies (Worker-only access, T-05-19). No route signs read URLs for these objects.
- `uploadPart(env, path, bytes)`: `storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: true })` with a fresh admin client. `upsert` makes a re-run after an interrupted upload overwrite the same deterministic bytes instead of failing. Throws `Error('storage_write_failed')` on any error.
- `downloadPart(env, path)`: `storage.from(BUCKET).download(path)` → `Uint8Array`. Throws `Error('storage_read_failed')` on an error or empty data. The consumer also uses it to read the source document (`documents.storage_key`), since that is the same bucket.

The admin client is created per call; no module-scope clients (Workers isolate rule).

## Tests

`logics-parts.test.ts` (admin client mocked): the path layout; `uploadPart` targets `case-documents` with the upsert options and throws `storage_write_failed` on an error; `downloadPart` returns the bytes or throws `storage_read_failed`.
