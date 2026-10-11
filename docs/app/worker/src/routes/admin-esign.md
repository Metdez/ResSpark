# `app/worker/src/routes/admin-esign.ts`

Staff routes for the firm's DocuSeal template mapping (Plan 06-05; D-01, D-10, D-11, SIGN-01). Mounted at `/api/admin` in `index.ts`, so the paths below are under `/api/admin`.

| Part | What it does |
|------|--------------|
| `App` | Hono env: `Bindings: Env`, `Variables: { staff: StaffCtx }`. |
| `fail(status, code)` | An `HTTPException` whose message is the error code; `index.ts` turns it into `{ error: { code, message } }`. |
| `isObj`, `validId` | A plain object (not an array); a template id is `null` or a positive integer. |
| `parsePatch(body)` | Validates the PUT body in this order: not an object, or empty → 400 `bad_request`; any key outside `engagement_letter`, `form_2848`, `form_8821` (checked with `isEsignTemplateKey`) → 400 `bad_template`; any value that is not a positive integer or `null` → 400 `bad_request`. The key check runs before the value check, so `form_433a` is always `bad_template` (D-01). |
| `checkTemplate(env, id)` | For a non-null id: no `DOCUSEAL_API_KEY` → 503 `provider_not_configured`; `getTemplate(env, id)` fails with a `ProviderError` of status 404 → 422 `template_not_found`; any other `ProviderError` → 502 `provider_error`; a template whose `submitters` count is not exactly 1 → 422 `template_not_single_signer` (D-11). |
| `.use('/esign/*', staffAuth)` | Staff session required. Scoped to `/esign/*` rather than `*` so it never verifies the token again on sibling `/api/admin` routes. |
| `GET /esign/settings` | Any staff member. 200 `{ configured, env, mapping }`: `configured` is `docusealConfigured(env)`; `env` is `production` only when `DOCUSEAL_ENV === 'production'`, otherwise `test`; `mapping` is `getEsignMapping(env, firmId)`. No DocuSeal call. |
| `GET /esign/templates` | Any staff member. 503 `provider_not_configured` without a key; otherwise `listTemplates(env)` (DocuSeal `GET /templates?limit=100`) as 200 `{ templates: [{ id, name }] }`; a `ProviderError` → 502 `provider_error`. |
| `PUT /esign/templates` | Check order: role `admin` (else 403 `forbidden`, T-06-20) → `parsePatch` → `checkTemplate` for each non-null id, in body order → `setEsignMapping(env, firmId, patch, userId)`, which writes and logs `settings.esign_templates_updated`. 200 `{ mapping }` with the full merged mapping. A `null` value clears a key without any DocuSeal call, so a key can be cleared even when DocuSeal is not configured. |

## Status codes

| Status | Code | When |
|--------|------|------|
| 200 | | Success. |
| 400 | `bad_request` | PUT body not an object, empty, or a value that is not a positive integer or `null`. |
| 400 | `bad_template` | PUT key outside the three-key whitelist. |
| 401 | `unauthorized` | No or bad staff token (from `staffAuth`). |
| 403 | `forbidden` | PUT by a `staff` role. |
| 422 | `template_not_found` | DocuSeal answered 404 for the id. |
| 422 | `template_not_single_signer` | The template has zero or more than one signer role. |
| 502 | `provider_error` | Any other DocuSeal failure (network, 5xx, bad response). |
| 503 | `provider_not_configured` | No `DOCUSEAL_API_KEY` and the call needs DocuSeal. |

## Tests

`admin-esign.test.ts` (see `admin-esign.test.md`).
