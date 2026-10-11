# Phase 3 — API Coverage Decision Matrix

> Produced by gsd-planner because the PLAN bodies integrate Supabase Storage for the first time in production (UPL-01/02/03). Default is `INTEGRATE`; every `OPT-OUT` carries a one-line reason. Scope: Supabase Storage, the Postgres RPC surface this phase adds, and the two client-side packages.

| capability | decision | reason |
|------------|----------|--------|
| **Supabase Storage — upload** | | |
| `createSignedUploadUrl(path)` → `{ token, path, signedUrl }` | INTEGRATE | Plan 01 `signedUploadToken` (D-01); the only way bytes get authorized without a Supabase user |
| Signed `PUT <signedUrl>` (what `uploadToSignedUrl` does) | INTEGRATE (fallback branch) | Plan 02 transport `'put'` when spike (c) failed the resumable path; XHR for progress, 3 attempts |
| TUS resumable `/storage/v1/upload/resumable/sign` with `x-signature` | INTEGRATE (primary branch) | Plan 02 transport `'tus'` when spike (c) passed; 6 MiB chunks, resume via fingerprint `rs-<document_id>` + token re-mint |
| `upload()` / `update()` with the service key from the Worker | OPT-OUT | bytes must never pass through the Worker (C14, D-01) |
| `upsert: true` on signed uploads | OPT-OUT | every object has a fresh `document_id` path; upsert would let a token overwrite a finalized object |
| **Supabase Storage — read / manage** | | |
| `createSignedUrl(path, 300)` (inline) | INTEGRATE | Plan 03 Preview for `application/pdf`, `image/jpeg`, `image/png` only (D-05) |
| `createSignedUrl(path, 300, { download: <name> })` (attachment) | INTEGRATE | Plan 03 Download; forced for any non-safe type |
| Signed URL `Range: bytes=0-15` read | INTEGRATE | Plan 01 `headBytes` — the D-03 magic-byte check without downloading the file |
| `download(path)` (full object through the Worker) | OPT-OUT | only as the `shortcut:` fallback if the server ignores `Range`; a full read buffers the file in the Worker |
| `remove([path])` | INTEGRATE | Plan 01 — mismatch/oversize deletion (D-03) |
| `list(prefix)` | INTEGRATE (tests only) | live-test cleanup of the case prefix; production lists documents from Postgres, not Storage |
| `move` / `copy` | OPT-OUT | paths are immutable per D-01; a Logics push (Phase 5) reads, never relocates |
| `createSignedUrls` (batch), `getPublicUrl` | OPT-OUT | one URL per click with its own audit event; the bucket is private so public URLs do not exist |
| Image transformations (`transform` option) | OPT-OUT | thumbnails are not in Phase 3 scope; preview opens the original |
| **Supabase Storage — buckets** | | |
| `INSERT INTO storage.buckets (…)` in migration `0004` | INTEGRATE | Plan 01 — private `case-documents`, `file_size_limit` 26214400, `allowed_mime_types` [pdf, jpeg, png] |
| `createBucket()` via the admin client | INTEGRATE (fallback) | only if the Management API rejects the SQL insert; recorded in the SUMMARY |
| `updateBucket`, `emptyBucket`, `deleteBucket` | OPT-OUT | no bucket lifecycle in v1; deleting would destroy client documents |
| `storage.objects` RLS policies for `anon`/`authenticated` | OPT-OUT | the Worker's secret key is the only Storage principal; no policies, no grants (orchestrator note, SKILL) |
| **Supabase Postgres (Worker, service role)** | | |
| RPCs `upload_complete`, `item_approve`, `item_reject`, `request_apply_status`, `request_status` | INTEGRATE | Plans 01/03 — every state change through an RPC that writes its event (D-05, D-06) |
| View `request_dashboard_v` | INTEGRATE | Plan 04 dashboard list (D-07); `REVOKE ALL` from anon/authenticated; in `rls.test.ts` |
| Supabase Realtime (Postgres Changes / Broadcast) | OPT-OUT | polling in v1 (D-08, CONTEXT Deferred Ideas) |
| **Client packages** | | |
| `heic2any` (lazy import) | INTEGRATE | Plan 02 — HEIC → JPEG only when a HEIC file is picked (D-02); VERIFIED in the Plan 02 legitimacy audit |
| `tus-js-client` | INTEGRATE (conditional) | Plan 02 — installed only on the TUS branch; VERIFIED |
| Uppy / react-dropzone / browser-image-compression | OPT-OUT | Ponytail + D-02: Canvas resize and a native `<input type=file>` cover the requirement with no new UI library |
