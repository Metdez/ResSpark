# Phase 1 — Day-one spike results (D-22)

Written results for spikes (a)–(f). The scripts under `spikes/` are evidence, not production code: nothing in `app/` imports them, they read credentials only from `process.env`, and they print statuses and key names only, never values.

How to re-run a spike (env is loaded from `app/.dev.vars` by the `spike` script in `app/package.json`, which runs `dotenv -e .dev.vars -- node <file>`):

```
pnpm -C app run spike ../.planning/phases/01-foundation-staff-sign-in/spikes/tus-signed-upload.mjs
pnpm -C app run spike ../.planning/phases/01-foundation-staff-sign-in/spikes/truv-order.mjs
```

## Spike (a) — Vitest 5 with the Workers plugin

Result: PASS (from Plan 03, `01-03-SUMMARY.md`): `@cloudflare/vitest-plugin` 1.4.0 works with Vitest 5.0.3. The workerd project runs `SELF.fetch('/api/config')` and gets 200 in 4.1 s.

Consequence for the test lane: the workerd project (`app/worker/test/workerd/`, `pnpm -C app run test:workerd`) is kept for tests that need real bindings and is excluded from `pnpm test`. Worker route tests otherwise run fast under the `worker-node` project with Hono's `app.request()`. The D-21 fallback was not needed.

## Spike (b) — `@supabase/server` Hono adapter

Resolved by research: @supabase/server adapters are deprecated (removal 2026-12-01); Plan 06 verifies staff JWTs with jose createRemoteJWKSet + jwtVerify against the project JWKS (ES256).

The adapter was not run on `wrangler dev` (RESEARCH Summary and Q3): building on an adapter with a published removal date two months out is wasted work. `jose` 6.2.12 is already pinned in `app/package.json`; the JWKS URL is `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`.

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

Blocked on plan + domain: Cloudflare Email Sending is Beta and needs a Cloudflare-DNS sending domain; the account is Workers Paid (2026-10-10) so the tier is not the blocker, the domain is. Decision: Resend over fetch (free tier 3,000/mo, 100/day). Phase 1 reserves RESEND_API_KEY and MAIL_FROM as secret/var names; Phase 2 REQ-04 can promise email once a Resend key and a verified sending domain exist — USER ACTION REQUIRED: create a Resend account and key before Phase 2.

Resend call shape (RESEARCH Q7): `POST https://api.resend.com/emails`, `Authorization: Bearer <RESEND_API_KEY>`, JSON `{ from, to, subject, html | text }` → `{ "id": "…" }`. The names are reserved in `app/.dev.vars.example` and the README secrets table only. They are deliberately NOT in `app/wrangler.jsonc` `secrets.required`, so deploys stay green until a key exists; Phase 2 adds `RESEND_API_KEY` to `secrets.required` in the same change that first sends mail.

## Spike (e) — Truv sandbox order

Run 2026-10-11 with `spikes/truv-order.mjs`. Output:

```
blocked: no Truv keys — to enable: pnpm -C app wrangler secret put TRUV_CLIENT_ID; pnpm -C app wrangler secret put TRUV_SECRET; and add both to app/.dev.vars
```

Result: blocked: no Truv keys. `TRUV_CLIENT_ID` and `TRUV_SECRET` are not in `app/.dev.vars` and are not Worker secrets.

USER ACTION REQUIRED before Phase 4: create Truv sandbox keys (the key prefix selects sandbox on the single host `https://prod.truv.com/v1/`), run the two `wrangler secret put` commands above (each prompts for the value), add both names to `app/.dev.vars`, then re-run `pnpm -C app run spike ../.planning/phases/01-foundation-staff-sign-in/spikes/truv-order.mjs`. Expected: `status: 201` and response keys including `id`, `bridge_token`, `share_url`, `employers` (only names are printed). The `multiple.employments` / `goodpassword` sandbox login is entered in the Truv Bridge UI, not via the API.

## Spike (f) — Logics scopes, FileCategoryID, ActivityType

Open question for Andrew (not a code task): (1) which scopes the Logics API key has (read cases, write Case Documents, write activities); (2) the FileCategoryID list and which one ValorTax uses for client-provided documents; (3) the ActivityType value for "document uploaded by ResSpark" notes. Needed before Phase 2 ends (STATE.md Phase 2 blocker).

Exact wording to send: "Andrew, before we wire ResSpark to push into Logics: (1) Which permissions does the Logics API key we were given have — can it read cases, upload Case Documents, and create activities/notes? (2) Can you send the list of document categories (FileCategoryID) and tell us which one ValorTax uses for documents the client provides? (3) Which ActivityType should a note like 'Document uploaded by ResSpark' use?"

Until answered, Phase 5 research defaults `ActivityType` to `General` and omits `FileCategoryID`.

## Assumption-delta decision

noun: (none — the "multiple" signal is the Truv sandbox login name multiple.employments, not an identity-model change); decision: no-change; rationale: Phase 1 adds no second actor or tenant type; the one add-alongside is cases.firm_id (Plan 04) recorded as accepted debt (second firm ⇒ NOT NULL + backfill).
