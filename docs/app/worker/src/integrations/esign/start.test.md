# `app/worker/src/integrations/esign/start.test.ts`

Unit tests for `startSignature`. `db/connections` and `./docuseal` are auto-mocked; `insertConnection` echoes its input with id `NEW`; the template and create responses come from the DocuSeal fixtures. A prior row is `PRIOR` with `submitter_id 5001` and a future `expire_at`.

| Test | Proves |
|------|--------|
| no prior row | `insertConnection` runs before `createSubmission` (`invocationCallOrder`); `docuseal`/`signature`; `send_email: false` at both levels, `send_sms: false`, `expire_at` = link expiry; `external_id` = item id; the row gets submission id and slug |
| two-role template | `TemplateInvalidError` (`template_invalid`), no row written |
| Address field and confirmed address | three read-only prefill fields, address as `line1, city, state zip5` |
| create fails `http_500` | new row set to `error` `{ code: 'http_500' }`, same error rethrown |
| prior `done` | `{ signed: true }`, no DocuSeal call |
| prior open, submitter `opened` | fresh `embed_src`, `reused: true`, no new row |
| prior open, submitter `completed` | `JOBS.send({ type: 'reconcile', ref: 'PRIOR' })`, `{ signed: true }` |
| prior open, submitter `declined` | prior set to `error` `{ code: 'declined' }`, one new submission |
| prior open, `expire_at` passed | prior set to `error` `{ code: 'expired' }`, `getSubmitter` not called, new row |
