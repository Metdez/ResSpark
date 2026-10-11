# `app/src/features/settings/integrations/esign-api.ts`

Typed SPA calls for the Worker's `/api/admin/esign` routes (Plan 06-05). Every response passes a guard before use.

| Part | What it does |
|------|--------------|
| `EsignMappingValue` | `Record<EsignTemplateKey, number \| null>`, one entry per key in `ESIGN_TEMPLATE_KEYS`. |
| `EsignSettings` | `{ configured, env: 'test' \| 'production', mapping }`, the `GET /settings` answer. |
| `EsignTemplate` | `{ id, name }`, one DocuSeal template. |
| `isMapping` (private) | An object where every template key is a number or `null`. |
| `isEsignSettings` | Guard for `EsignSettings`. |
| `isTemplates` (private) | Guard for `{ templates: EsignTemplate[] }`. |
| `ESIGN_SETTINGS_KEY` | React Query key `['esign', 'settings']`, shared by the settings card and the request builder. |
| `getEsignSettings()` | `GET /api/admin/esign/settings`. |
| `listEsignTemplates()` | `GET /api/admin/esign/templates`, unwrapped to the array. |
| `saveEsignMapping(patch)` | `PUT /api/admin/esign/templates` with only the changed keys; resolves to the full merged mapping. |

Errors arrive as `ApiError` from `api()` (`lib/api.ts`) with the Worker's code (`forbidden`, `template_not_single_signer`, and so on).

## Tests

`esign-api.test.ts`: `isEsignSettings` accepts both envs and rejects a bad env, a missing key, a string id, and `null`.
