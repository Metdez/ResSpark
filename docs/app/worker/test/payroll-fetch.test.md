# `app/worker/test/payroll-fetch.test.ts`

Live proof for PAY-02 (Plan 04-03 Task 2) against the live Supabase project (test firm `00000000-0000-0000-0000-00000000000e`). Only Truv is stubbed. Skips when `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing. Each test may take up to 30 s (real Storage uploads).

Run: `pnpm -C app run test:live:file worker/test/payroll-fetch.test.ts`.

## Setup

- `seedConnectionFixture(env, { kind: 'payroll' })` and a `pending` Truv connection with `external_id ord_fixture_fetch` (not the tracer's `ord_fixture_1`, because live files run in parallel).
- Stubs: the order (`order_two_employers.json`: Acme `emp_1`/`link_acme` and Beta `emp_2`/`link_beta`, both completed), both income reports, both document lists, and every `https://files.truv.test/...` URL answered with `fixtures/files/tiny.pdf`. The fixture `md5sum` values are the MD5 of `tiny.pdf` (`de1a4717a439971406ee206790713d6a`); `.gitattributes` marks `*.pdf` binary so line-ending conversion cannot change it.

## Cases

1. `reconcileConnection(..., { source: 'cron' })` gives `done`. Six `documents` rows (income report 1, pay stubs 3, W-2 1, 1099 1), all `ready`, on the payroll item, `provider:truv`; each object exists in Storage (`headBytes`); five under `/payroll/acme-inc-emp_1/`, one under `/payroll/beta-llc-emp_2/`. Employer counts 2/1/1 and 1/0/0 with `fetched_at`; `connections.data` holds no `files.truv.test` URL and not the report's access token. Item `submitted`; one `connection.done` event.
2. Rerun: still six rows; the only vendor call is `GET /v1/orders/ord_fixture_fetch/`.
3. Beta's `fetched_at` is cleared and its report gains a statement with a wrong `md5sum`: the run rejects with `ProviderError` `file_hash_mismatch`; only the bad file was downloaded (the stored Beta stub was skipped before download); no row for `Pay stub - October 15, 2026 - check 78.pdf` (documents carry the readable display name since 2026-10-18; the storage key keeps `paystub-<pay_date>[-<check>].pdf`).

`afterAll` removes the Storage objects and the `documents` rows of the connection, then `fx.cleanup()`.
