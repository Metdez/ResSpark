# `app/worker/test/esign-start.test.ts`

Live tracer for SIGN-01 / SIGN-03 against the Supabase project, DocuSeal stubbed with `stubVendorFetch`. Skipped (with a console warning) unless `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `CLIENT_LINK_HMAC_KEY` are set; run through `pnpm -C app test:live`.

Setup: `seedPortalItems({ kinds: ['signature'], logicsCaseId: 900002 })` (test firm only); the firm's `settings` are saved, `esign_templates.engagement_letter = 1001` is set, and the original settings are restored in `afterAll`, which also deletes the request and its connections (cases are never deleted). Env adds a fake `DOCUSEAL_API_KEY`, the DocuSeal URL and env, and a mocked `JOBS`. Stubs: `GET /templates/1001`, `POST /submissions`, `GET /submitters/5001` from `test/fixtures/docuseal/*.json`.

| Test | Proves |
|------|--------|
| refuses before consent | 409 `consent_required`, zero vendor calls, zero connections |
| records the esign consent | one `consents` row `esign`/`esign-v1`, one `consent.esign` event |
| creates row then submission | 200 `{ connection_id, embed_src }`; body has `send_email`/`send_sms` false, `expire_at` = link expiry, one `Client` submitter with name, email, item id, and only `Full name` and `Case ID` prefilled read-only (the fixture template has no `Address`); every call has `x-auth-token`; the row is `docuseal`/`signature`/`pending` with submission id and `link_ref` null (the slug is never stored); one `connection.started`; no event or row data contains the embed URL or slug; the start latency is printed |
| reuses on the next start | same `connection_id`, one `GET /submitters/5001`, still one `POST /submissions`; `listRequestConnections` hides the signature row |

- The admin client is built only when the live env is present (`live ? createAdminClient(env) : undefined`), because `describe.skipIf` still runs the describe body at collection time; without this the whole file crashed `pnpm check` when env was missing.
