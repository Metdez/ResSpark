# `app/worker/src/integrations/esign/ingest.ts`

Collects, downloads and stores the signed PDFs and the audit-trail PDF of a completed DocuSeal submission (Plan 06-04, D-19, SIGN-02).

## Exports

- `SignedArtifact`: `{ document_type: 'signed_document' | 'esign_audit_log', name, url }`.
- `collectArtifacts(sub, submitterId)`:
  - Uses `sub.documents`; when that is empty, the documents of the submitter whose `id` is `submitterId`.
  - Returns `[]` when there are no documents or `audit_log_url` is null (generation may lag completion; the caller retries).
  - Signed documents are named `signed-{i+1}-{safeName(name without a trailing .pdf)}.pdf` (the index keeps two same-named documents apart); the audit log is `audit-log.pdf`. The fixture produces `signed-1-Engagement_letter_demo_.pdf` and `audit-log.pdf`.
- `downloadArtifact(url)`:
  - A URL that does not parse or is not `https:` → `ProviderError('docuseal', null, 'bad_url', false)` and no fetch.
  - Fetches with no headers at all, so `X-Auth-Token` never reaches a document host (T-06-17).
  - Network failure → `network`, transient. Non-2xx → `file_download_failed`, transient for 404 (the retry re-reads the submission and gets fresh URLs), 429 and 5xx; other statuses such as 403 are not transient.
- `ingestSignedArtifacts(env, conn, submissionId, artifacts)`: for each artifact calls `storeProviderFile(env, { conn, kind: 'signature', group: String(submissionId), name, mime: 'application/pdf', document_type, bytes: () => downloadArtifact(url), actor: 'provider:docuseal' })`. The loader runs only for paths not stored yet; `storeProviderFile` checks `%PDF-`, computes sha256 and inserts the `documents` row. Returns `{ created, document_ids }`.

URLs are never stored or logged; they live only inside the job.

## Tests

`ingest.test.ts`: naming for the fixture, the submitter fallback, empty documents and a null audit log → `[]`, duplicate names stay distinct, `bad_url` with no fetch, 404 transient, 403 not transient, no `x-auth-token` on downloads, and the exact `storeProviderFile` arguments.
