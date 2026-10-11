# `app/worker/src/integrations/esign/start.ts`

Lazy DocuSeal submission for one signature item (D-12, RESEARCH Pattern 2). Same row-before-URL shape as `truv/start.ts`.

## Exports

- `SignStartCtx`: client session, the item, the case fields used for prefill (name, email, Logics case id, confirmed address), the request's `contact_email`, the template key and the DocuSeal template id.
- `SignStartResult`: `{ connection_id, embed_src?, signed?, reused }`. `reused` stays server-side; the route strips it.
- `TemplateInvalidError`: thrown when the template does not have exactly one signer role (D-11). The route answers 503 `template_invalid`.
- `startSignature(env, ctx)`.

## Reuse and retry (latest connection for the item)

| Latest row | Action | Result |
|------------|--------|--------|
| `done` | none | `{ signed: true }` |
| `pending/connected/syncing`, `data.expire_at` passed | status `error` `{ code: 'expired' }`, no DocuSeal read | create new |
| open, submitter `completed` | `JOBS.send({ type: 'reconcile', ref })` | `{ signed: true }` |
| open, submitter `declined` | status `error` `{ code: 'declined' }` | create new |
| open, any other status | none | `{ embed_src }` fresh from `GET /submitters/{id}` |
| none, `error`, or `removed` | create | new row and submission |

## Create

1. `getTemplate(templateId)`; more or fewer than one signer role throws `TemplateInvalidError` before any row is written.
2. Prefill candidates: `Full name` (first + last), `Case ID` (Logics case id), `Address` (`line1, city, state zip5`, only when a confirmed address exists). Only names present in the template's fields and with a non-empty value are sent, each `readonly: true`.
3. `insertConnection` (`provider 'docuseal'`, `kind 'signature'`, `data { template_key, template_id, env, expire_at }`) **before** the vendor call.
4. `createSubmission` with `send_email: false` (submission and submitter), `send_sms: false` (D-21), `expire_at` = the link's `expires_at` (ISO 8601 as stored), one submitter with the template's role, the case name, `contactEmail ?? case email`, `external_id` = item id. A `ProviderError` sets the row to `error` with its code and rethrows.
5. `updateConnection`: `external_id` = submission id, `data.submitter_id`. The submitter `slug` is **not** stored: `docuseal.com/s/{slug}` is a bearer signing link, and nothing reads it (reuse fetches a fresh `embed_src` through `GET /submitters/{id}`), so `link_ref` stays `NULL` for DocuSeal rows (2026-10-11 hardening).
6. `connection.started` event with `{ provider, template_key }` only.

`embed_src` exists only in the return value: never in a table, event, or log (T-06-07).

## Tests

Unit tests: see [`start.test.md`](start.test.md).
