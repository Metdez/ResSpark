# `app/worker/src/jobs/logics-push-normalize.ts`

Turns a claimed push row into the exact bytes to send (PUSH-02, D-05, D-06). Called by `prepare` in `logics-push.ts` after the guard, mode and credential checks, and before any byte goes to Logics.

## Exports

- `NormalizedPart`: `{ fileName, bytes, sha256, partIndex, partCount }`, the part the consumer dispatches.
- `EnsureResult`: `{ ok: true, part }` or `{ ok: false, code, detail, manual }`. `manual` is true only when ResSpark cannot shrink the file; the consumer then sets `needs_manual_compression` on the failed row.
- `MANUAL_COPY`: staff copy per normalizer error code (shown as is by the push UI, stored as `error_detail`):

| Code | Copy |
|------|------|
| `pdf_page_too_large` | One page is too large to send. Compress it outside ResSpark and re-upload. |
| `pdf_encrypted` | This PDF is password-protected. Ask for an unlocked copy. |
| `pdf_unparseable` | This file could not be read as a PDF. |
| `image_unsupported_format` | Ask the client to re-upload as JPG or PDF. |
| `source_too_large` | This file is over 40 MB. Compress it outside ResSpark and re-upload. |

- `ensureNormalized(env, job, opts?)`: `opts.targetBytes` defaults to `LOGICS_MAX_PART_BYTES` (5.5 MiB); tests lower it.

## Part layout

`firm/{firm_id}/case/{case_id}/logics/{document_id}/part-{k}.pdf` in the private `case-documents` bucket (`partPath` in `storage/logics-parts.ts`). Every part, including a single unsplit part 0, is stored, so a re-send reads stored bytes.

## `ensureNormalized` flow

1. **Stored part** (`part_storage_path` set: a sibling, or a staff re-send of an already-normalized part): `downloadPart` that path, check `sha256hex(bytes) === part_sha256` (`part_hash_mismatch`, not manual), return it with the row's `file_name`, `part_index`, `part_count`. No normalization, no ledger writes, no messages.
2. **Part 0, first run**: download `storage_key` (the client's upload); `sha256hex(bytes) !== documents.sha256` → `source_hash_mismatch` (T-05-14).
3. `normalizeForLogics({ bytes, mime: source_mime, name: file_name }, { targetBytes })`. The source reference is dropped right after (C14). `ok: false` → `{ ok: false, code, detail: MANUAL_COPY[code], manual: true }`.
4. For each part k, in order: `uploadPart(partPath(k), bytes)` (upsert), and build `{ partIndex, fingerprint: fingerprintHex(case_id, source_sha256, k), fileName, storagePath, bytes: byteLength, sha256 }`.
5. `addParts(env, { pushId, partCount: n, parts })` (RPC `logics_push_add_parts`): part 0's row gets `part_count`, path, size, hash and the normalizer's file name; parts 1..n-1 become `queued` sibling rows. A fingerprint already present is skipped in SQL, so a re-run inserts no duplicates and returns no ids for them.
6. `env.JOBS.send({ type: 'logics_push', provider: 'logics', ref })` per new sibling id. A failed send is swallowed (`shortcut:` comment): the sibling stays `queued` and the cron sweeper re-enqueues it after 5 minutes.
7. Return part 0.

Storage failures are `storage_read_failed` / `storage_write_failed` with "ResSpark could not read/write the file in storage. Re-send to try again." (not manual). An `addParts` database error throws; the consumer maps it to a `failed` row.

## Determinism

The splitter and image wrapper produce identical bytes for identical input (verified by the unit test), so a run interrupted after the upload and before dispatch can run again: same paths, same hashes, same `addParts` arguments, no duplicate siblings.

## Tests

`logics-push-normalize.test.ts`: see its companion doc.
