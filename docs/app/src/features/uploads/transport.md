# `app/src/features/uploads/transport.ts`

Moves a processed file from the phone straight to Supabase Storage (never through the Worker, D-01), with progress, and remembers half-finished uploads so a reload can resume them.

## Active branch: TUS (resumable)

`UPLOAD_TRANSPORT = 'tus'`, chosen from `.planning/phases/01-foundation-staff-sign-in/01-SPIKES.md` § Spike (c):

> Result: PASS (simple path `uploadToSignedUrl`) / PASS (resumable TUS via `/storage/v1/upload/resumable/sign`)

| Spike (c) result | Branch | Resume after reload | Package |
|------------------|--------|---------------------|---------|
| Resumable PASS (this project) | `tus` | Yes: tus continues from its stored upload URL | `tus-js-client` 4.3.1 (MIT), loaded by dynamic `import()` |
| Resumable FAIL | `put` | No: the same file uploads again from zero | none |

Both branches are implemented and tested; the constant picks the default. `tus-js-client` is only loaded inside the TUS branch, so it is a separate lazy chunk.

## Exports

| Symbol | What it is |
|--------|------------|
| `Transport` | `'tus' \| 'put'`. |
| `UPLOAD_TRANSPORT` | The active branch (`'tus'`). |
| `UploadTarget` | `{ document_id, path, token, signed_url }`, the mint (or re-mint) response. |
| `UploadError` | `Error` with `code` (`upload_failed`, `network`, `aborted`) and the HTTP `status` (0 for a network error). The sheet maps `code` through `errorCopy`. |
| `tusEndpoint()` | `https://<ref>.storage.supabase.co/storage/v1/upload/resumable/sign`, built from `VITE_SUPABASE_URL` by inserting `.storage` before `.supabase.co` (the host the spike proved). A non-`supabase.co` host (local or custom domain) is used as-is. |
| `uploadBlob(target, blob, mime, onProgress, { transport, signal })` | Uploads with the chosen branch. `onProgress` gets a fraction from 0 to 1. `transport` defaults to `UPLOAD_TRANSPORT` (tests pass the other one). An aborted `signal` stops the request and rejects with `aborted`. |
| `pendingKey(file)` | `name|size|lastModified`, the identity of a picked file across reloads. |
| `readPending(itemId)` | `{ fileKey: document_id }` for one item. |
| `writePending(itemId, fileKey, documentId)` | Adds or replaces one entry. |
| `clearPending(itemId, fileKey)` | Removes one entry. |

The publishable key (`VITE_SUPABASE_PUBLISHABLE_KEY`) is public by design. It is read from `import.meta.env` here, not through `@/lib/supabase`, so supabase-js stays out of the `/c/*` bundle.

## TUS branch (`viaTus`)

`new tus.Upload(blob, options)` with:

- `endpoint`: `tusEndpoint()`.
- `headers`: `apikey` (publishable key) and `x-signature` (the Worker-minted token). Every request, including each `PATCH`, carries them.
- `chunkSize: 6 * 1024 * 1024`: Supabase requires every chunk except the last to be exactly 6 MiB (spike (c)).
- `uploadDataDuringCreation: true`: the first chunk rides on the creation `POST`, saving a round trip for small files.
- `removeFingerprintOnSuccess: true`: tus forgets the upload URL once finished.
- `retryDelays: [0, 3000, 5000, 10000, 20000]`: tus's own retries within one session.
- `metadata`: `{ bucketName: 'case-documents', objectName: target.path, contentType: mime, cacheControl: '3600' }`.
- `fingerprint`: `rs-<document_id>`. The processed `Blob` has no name or `lastModified`, so tus's default fingerprint would not survive a reload; the document id does. `shortcut:` resuming assumes re-encoding the same photo gives identical bytes on the same browser. When it does not, tus reports an error and the sheet starts that file over.
- `onProgress`: `sent / total`.
- `onError`: a 4xx from Storage (for example an expired token) rejects with `upload_failed`; anything else rejects with `network`.

Before `start()`, `findPreviousUploads()` looks up the fingerprint; if tus stored an upload URL for it, `resumeFromPreviousUpload` continues from the server's offset. Supabase keeps that URL valid for up to 24 hours. Abort calls `upload.abort()`.

## PUT branch (`viaPut`)

`XMLHttpRequest` (needed for upload progress; `fetch` has none) `PUT target.signed_url` with headers `content-type: <mime>`, `apikey`, and `x-upsert: false`.

- 2xx resolves.
- 4xx rejects immediately with `upload_failed` and the status; it is not retried.
- A network error (status 0) or a 5xx is retried. Attempt 1 is immediate; attempts 2 and 3 wait 1 s and 3 s (`PUT_DELAYS = [1000, 3000, 5000]`; the 5 s value is reserved for a fourth attempt). After 3 attempts it rejects with `network`.
- Each attempt starts from byte zero (D-01's retry-from-zero).

## Pending-upload map

`localStorage['rs_pending_uploads']` holds JSON `{ [itemId]: { [fileKey]: document_id } }`. The sheet writes an entry after a mint and clears it after `complete`, so a re-picked file after a reload re-mints a token for the same document (`POST /api/c/uploads/:documentId/token`) and tus resumes. It holds ids only, no tokens (threat T-03-09). Every access is in `try`: private mode, a full quota, a throwing `localStorage` getter or corrupt JSON all behave as "nothing pending", and non-string values are dropped.

## Tests

`transport.test.ts` (jsdom):

- Pending map: key format, write/read/clear per item, corrupt JSON and non-string values read as `{}`, and a throwing `localStorage` getter makes all three helpers no-ops.
- PUT (stubbed `XMLHttpRequest`): URL and headers, progress `0.5`, two network errors then 200 resolve after 3 sends with `setTimeout` delays `[1000, 3000]` (fake timers), a 403 rejects `upload_failed` after one send, three 5xx reject `network`.
- TUS (`vi.mock('tus-js-client')`): the constant is `'tus'`; endpoint, headers, chunk size, creation upload, fingerprint removal, metadata, the `rs-D1` fingerprint and progress `0.75`; `find` then `start`; a previous upload is resumed before `start`; `onError` rejects `network`.
