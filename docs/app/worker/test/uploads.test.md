# `app/worker/test/uploads.test.ts`

Live proof of the client upload path (Plan 03-01; UPL-01, UPL-02) against project `zvkphuikjpwoauqdimcf`. It drives the real Worker app (`app.request`) with a real `rs_client` cookie, PUTs real bytes to Supabase Storage, and checks the rows the `upload_complete` RPC writes.

Run: `pnpm -C app run test:live:file worker/test/uploads.test.ts`. The script loads the env files through `dotenv-cli`; the test never prints a secret. Without `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY` and a publishable key (`SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`) the suite is skipped, and its title names what is missing.

## Fixtures

| Fixture | Value |
|---------|-------|
| Firm | `00000000-0000-0000-0000-00000000000e`, `Test firm (automated)`, upserted if missing. |
| Case | `00000000-0000-0000-0000-0000000000e1` under the test firm, upserted if missing. It is permanent: `events` is append-only and `events.case_id` has no `ON DELETE`, so a case with events cannot be deleted. |
| Request | Inserted per run: `status 'opened'`, `sent_at`/`opened_at` now, `template_name 'test'`. |
| Item | One `upload` item, required, `pending`, label `ID`. |
| Link and cookie | `createClientLink`, then `mintLinkToken` and `GET /c/<token>` (`redirect: 'manual'`); the `rs_client=` pair from `set-cookie` is sent on every later call. |

## Helpers

`post` sends JSON with the cookie and `X-Requested-With: ResSpark` (unless told not to). `put` PUTs bytes to a signed upload URL with `content-type` and the publishable `apikey`. `fileOf(size, magic)` builds a buffer that starts with the given magic bytes. `sha` is the hex SHA-256. `docRow` reads a `documents` row; `uploadedEvents` counts the request's `document.uploaded` events.

## Cases

| Case | Asserts |
|------|---------|
| No CSRF header | Mint without `X-Requested-With` → 403 `bad_origin`, and no `documents` row exists. |
| Mint | 201 with `document_id`, `token`, and a `/storage/v1/object/upload/sign/` URL. The row is `uploading` with `storage_key = firm/<firm>/case/<case>/item/<item>/<document>/id.jpg`, and the item moved to `in_progress`. |
| PUT and complete | A 1 KiB body starting `FF D8 FF E0` PUT to the signed URL → 200. A signed read with `range: bytes=0-15` → 206 `bytes 0-15/1024` (this is why `headBytes` has no 200 branch). Complete → 200 `{ ready, submitted, waiting_on_staff }`; the row has `size_bytes 1024` and the hash; item `submitted`; request `waiting_on_staff`; exactly one `document.uploaded` event. |
| Idempotent | A second complete → 200 with `already: true`, still one event. |
| Mismatch | Mint `fake.pdf` as `application/pdf`, PUT 64 bytes starting `FF D8 FF`, complete → 422 `{ code: 'bad_file_type', message: 'That file is not a PDF or photo. Try again.' }`. `headBytes` then returns `null` (the object is gone), the row is `deleted`, and no event was added. |

## Cleanup

`afterAll` removes every object whose key is in a `documents` row of the test case, deletes those rows, and deletes the request (which cascades its items, link and session). The test firm, its case and the events stay; every admin query is firm-scoped, so ValorTax staff never see them. After a run, `storage.objects` in `case-documents` and `public.documents` both count 0.
