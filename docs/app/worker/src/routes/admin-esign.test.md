# `app/worker/src/routes/admin-esign.test.ts`

Vitest (`worker-node` project) for the e-sign template mapping routes, driven through `app.request()`. No network.

- Mocks: `../db/esign-settings` (automock; `getEsignMapping` and `setEsignMapping` resolve a fixed mapping), `getTemplate` and `listTemplates` from `../integrations/esign/docuseal` (the rest of that module is real, so `docusealConfigured` reads the env), and `staffAuth`, which sets user `U1` in firm `F1` with the role from the `x-test-role` header, or runs the real middleware when the header is absent.
- `ENV` carries a DocuSeal key; `NO_KEY` has none.
- `template(signers)`: a `DsTemplate` with that many submitters.
- `call`, `put`, `code`: request helpers and the error-code reader.

Cases (20, counting the `it.each` rows):

- settings: unconfigured test mode with the mapping and no DocuSeal call; `production` only from `DOCUSEAL_ENV`; 401 without a staff session;
- templates: 503 without a key; the `{ id, name }` list for a staff member; 502 on a DocuSeal error;
- PUT: 403 for staff with no write; `form_433a` → 400 `bad_template`; six bad bodies → 400 `bad_request`; a valid id checks the template and saves only the sent key; two signers → 422 `template_not_single_signer`; DocuSeal 404 → 422 `template_not_found`; another DocuSeal error → 502; `null` clears without DocuSeal even when unconfigured; a non-null id without a key → 503.
