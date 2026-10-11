# `app/worker/test/esign-complete.test.ts`

Live SIGN-02 / WEBH-01 tracer (Plan 06-04). Needs `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `CLIENT_LINK_HMAC_KEY`; skipped with a printed reason otherwise. Runs under the test firm only. Only DocuSeal is stubbed (`stubVendorFetch`): `GET api.docuseal.com/submissions/4101` and the two `docuseal.com/file/...` downloads (both serve `fixtures/files/tiny.pdf`).

## Ids

Submission `4101` and submitter `5101`, rewritten from the `4001`/`5001` fixtures: `esign-start.test.ts` holds a `docuseal` connection with `external_id '4001'` while it runs, and `(provider, external_id)` is unique, so parallel files would collide.

## Setup and cleanup

`seedPortalItems({ kinds: ['signature'] })`, then a `docuseal`/`signature` connection with `external_id '4101'` and `data { template_key, template_id, submitter_id, env, expire_at }`. Env adds the DocuSeal test key, API URL, `DOCUSEAL_ENV 'test'`, a random `whsec_test_…` webhook secret and a recording `JOBS.send`. `beforeAll` and `afterAll` delete this file's two ledger keys; `afterAll` removes the request, its connection, documents and stored objects. The case is never deleted.

## Tests

1. A signed `form.completed` → 200 `{ ok: true }` in under 1000 ms (measured 109 ms), one `queued` ledger row, one `{ type: 'webhook', provider: 'docuseal', ref }` job, no vendor call.
2. The same bytes again → `{ ok: true, duplicate: true }`, nothing enqueued.
3. `queue()` with the job → one ack, no retry; exactly one `GET /submissions/4101` with `x-auth-token: test-key`; two downloads with no `x-auth-token`; two `documents` rows (`esign_audit_log`, `signed_document`) with the sha256 of `tiny.pdf`, `ready`, `provider:docuseal`, the connection id, and keys under `firm/…/item/…/signature/4101/`; both objects start with `%PDF-`; connection `done` with `completed_at`; item `submitted`; request `waiting_on_staff`; one `connection.done` event; ledger row `done`; no `docuseal.com/file/` string in documents, connection data or event payloads.
4. A body signed with another secret → 401 `invalid_signature`, no ledger row.
