# Phase 1 — Day-one spike results (D-22)

Written results for spikes (a)–(f). The scripts under `spikes/` are evidence, not production code: nothing in `app/` imports them, they read credentials only from `process.env`, and they print statuses and key names only, never values.

How to re-run a spike (env is loaded from `app/.dev.vars` by the `spike` script in `app/package.json`, which runs `dotenv -e .dev.vars -- node <file>`):

```
pnpm -C app run spike ../.planning/phases/01-foundation-staff-sign-in/spikes/tus-signed-upload.mjs
pnpm -C app run spike ../.planning/phases/01-foundation-staff-sign-in/spikes/truv-order.mjs
```

## Spike (a) — Vitest 5 with the Workers plugin

_Filled in Task 2._

## Spike (b) — `@supabase/server` Hono adapter

_Filled in Task 2._

## Spike (c) — signed TUS upload without a session

Run 2026-10-11 against the live project with `spikes/tus-signed-upload.mjs`.

Result: PASS (simple path `uploadToSignedUrl`) / PASS (resumable TUS via `/storage/v1/upload/resumable/sign`)

Setup: the admin client (secret key) created a private bucket `spike-tus` (25 MiB limit) and minted one signed upload token per object with `createSignedUploadUrl(path)`. The uploading client was built with the publishable key and `auth.persistSession: false`; `getSession()` returned none before the upload, so no session was involved at any step.

| Path | Call | Response codes | Object stored |
|------|------|----------------|---------------|
| A — simple | `anon.storage.from(bucket).uploadToSignedUrl(path, token, 2 MiB)` | success (no error) | `spike/simple.bin` size 2097152 |
| B — resumable TUS | `POST https://<ref>.storage.supabase.co/storage/v1/upload/resumable/sign` with `apikey: <publishable>`, `x-signature: <token>`, `Tus-Resumable: 1.0.0`, `Upload-Length: 10485760`, `Upload-Metadata: bucketName,objectName,contentType` (base64) | `201` + `Location` | — |
| | `PATCH <Location>` `Upload-Offset: 0`, 6 MiB body, `Content-Type: application/offset+octet-stream` | `204`, `Upload-Offset: 6291456` | — |
| | `PATCH <Location>` `Upload-Offset: 6291456`, 4 MiB body | `204`, `Upload-Offset: 10485760` | `spike/resumable.bin` size 10485760 |

Exact endpoint that worked: `https://<ref>.storage.supabase.co/storage/v1/upload/resumable/sign` (the dedicated storage host, first try; the project-host fallback `https://<ref>.supabase.co/...` was not needed and was not exercised). The `PATCH` requests carried the same `apikey` + `x-signature` headers.

Chunk-size rule: every TUS chunk except the last must be exactly 6 MiB (6291456 bytes); the last chunk carries the remainder. tus-js-client must be configured with `chunkSize: 6 * 1024 * 1024`.

Cleanup: both objects removed, bucket `spike-tus` deleted.
buckets after cleanup: 0 (re-checked with `node app/scripts/db-migrate.mjs --query "select count(*)::int as n from storage.buckets"` → `"n": 0`).

Phase 3 implication (UPL-01): the client portal can upload with no Supabase session. The Worker mints `createSignedUploadUrl` per document slot after validating the client-link cookie and returns `{ path, token }`; the browser holds only the publishable key. Use `uploadToSignedUrl` for files up to 6 MiB and tus-js-client against `https://<ref>.storage.supabase.co/storage/v1/upload/resumable/sign` with `x-signature` for anything larger (phone uploads of multi-page scans), so a dropped mobile connection resumes instead of restarting.

## Spike (d) — Cloudflare Email Service vs Resend

_Filled in Task 2._

## Spike (e) — Truv sandbox order

_Filled in Task 2._

## Spike (f) — Logics scopes, FileCategoryID, ActivityType

_Filled in Task 2._
