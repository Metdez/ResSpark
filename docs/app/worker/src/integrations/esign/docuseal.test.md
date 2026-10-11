# `app/worker/src/integrations/esign/docuseal.test.ts`

Unit tests for the DocuSeal client. `fetch` is stubbed per test with `vi.stubGlobal`; fixtures come from `app/worker/test/fixtures/docuseal/`. Env: key `k1`, URL `https://api.docuseal.com`.

| Test | Proves |
|------|--------|
| auth token and host | `GET https://api.docuseal.com/templates/1001` with `x-auth-token: k1` |
| create returns the array | `createSubmission` resolves the fixture submitter array via `POST` |
| non-array 200 | `bad_response`, not transient |
| 422 | `http_422`, not transient |
| 503 | transient |
| thrown fetch | `network`, transient |
| listTemplates | URL has `limit=100`; `data[]` maps to `{ id, name }` |
| `http://evil.example/s/x` embed URL | rejected as `bad_response` |
| no key | `provider_not_configured`, `fetch` never called |
