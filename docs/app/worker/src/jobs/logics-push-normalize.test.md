# `app/worker/src/jobs/logics-push-normalize.test.ts`

Unit tests for `ensureNormalized`. `uploadPart` / `downloadPart` and `addParts` are mocked (the real `partPath` and `fingerprintHex` are kept); `addParts` returns one fake sibling id `S{k}` per part after part 0. `env.JOBS.send` is a spy. Fixtures come from `pdf/test-fixtures.ts` and run through the real normalizer.

- A 1-page ~2 KB PDF → one part named `stmt.pdf`, one upload to `…/logics/d/part-0.pdf`, `addParts` with `partCount 1` and one entry, no messages.
- A 12-page ~720 KB PDF at `targetBytes 200_000` → N ≥ 3 parts, uploads to `part-0..part-(N-1)`, fingerprints equal `fingerprintHex('c', sha, k)`, every part ≤ 200,000 bytes, one message per sibling id, part 0 returned as `stmt (part 1 of N).pdf`.
- Two runs on the same job → identical `addParts` arguments (paths, sizes, hashes).
- A job with `part_storage_path` set → `downloadPart(that path)`, returned as is; no upload, `addParts` or message.
- A stored part with the wrong hash → `part_hash_mismatch`, not manual.
- `TINY_JPEG` named `id.jpg` → one part `id.pdf`.
- `HEIC_STUB` → `{ ok: false, code: 'image_unsupported_format', manual: true, detail: 'Ask the client to re-upload as JPG or PDF.' }`, nothing uploaded.
- Wrong `source_sha256` → `source_hash_mismatch`; a download error → `storage_read_failed`; neither manual.
