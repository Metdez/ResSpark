# `app/worker/src/integrations/esign/docuseal.ts`

Plain-`fetch` DocuSeal REST client (D-08). No SDK and no provider interface. Request shapes come from DocuSeal's public OpenAPI file (docuseal.com/docs/api); no AGPL DocuSeal code is copied.

## Exports

- `docusealConfigured(env)`: true when `DOCUSEAL_API_KEY` is set. DocuSeal secrets are optional and never in `secrets.required`.
- `DsTemplate`, `DsSubmitter`, `DsSubmission`: the fields the app reads.
- `dsFetch(env, path, init, guard)`: calls `env.DOCUSEAL_API_URL + path` with `X-Auth-Token`, JSON content type and accept headers.
  - Unconfigured: `ProviderError('docuseal', null, 'provider_not_configured', false)`.
  - Thrown fetch: `ProviderError(..., null, 'network', true)`.
  - Non-2xx: `ProviderError(..., status, 'http_<status>', isTransientStatus(status))` (429 and 5xx retry).
  - Guard fails: `ProviderError(..., status, 'bad_response', false)`.
  - Request and response bodies and headers are never logged (PII, the API key, signing URLs).
- `listTemplates(env)`: `GET /templates?limit=100` (the documented maximum), mapped to `{ id, name }[]`.
- `getTemplate(env, id)`: `GET /templates/{id}`; the guard requires `fields[].name` and `submitters[].name`.
- `createSubmission(env, body)`: `POST /submissions`. The response is a **non-empty array of submitters** (RESEARCH contradiction 2), not a submission object.
- `getSubmission(env, id)`: `GET /submissions/{id}`.
- `getSubmitter(env, id)`: `GET /submitters/{id}`.

## Guards

A submitter needs numeric `id` and `submission_id`, string `slug` and `status`, and an `embed_src` starting with `https://`. The embed URL goes to the client's browser, so a non-https URL is rejected as `bad_response`.

## Tests

Unit tests: see [`docuseal.test.md`](docuseal.test.md).
