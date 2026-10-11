# `app/src/features/settings/integrations/logics-settings-api.ts`

The SPA side of the Logics credentials routes from Plan 02-03 (LOOK-05, D-01, D-03): types, runtime guards, and three callers. Every call goes through `api()` from `lib/api.ts`.

| Part | What it does |
|------|--------------|
| `IntegrationStatus` | `GET`/`PUT /api/admin/integrations/logics`: `configured`, `base_url`, `key_hint` (last 4 of the API key, never the key), `last_test_at`, `last_test_ok`, `updated_at`, `mode` (`fake` or `live`). |
| `TestResult` | `POST .../logics/test`: `ok`, `status` (the Logics HTTP status, or `null` when Logics was never reached), `tested_at`. |
| `strOrNull` | Small predicate for nullable strings. |
| `isIntegrationStatus` | Guards every field above, including `mode` being exactly `fake` or `live`. |
| `isTestResult` | Boolean `ok`, numeric-or-null `status`, string `tested_at`. |
| `PATH` | `/api/admin/integrations/logics`. |
| `getLogicsStatus()` | `GET PATH`. Staff and admins can both read it. |
| `saveLogicsCredentials({ api_key, secret_token, base_url? })` | `PUT PATH`. A blank or whitespace `base_url` is left out of the body, so the Worker applies the ValorTax default. Admin only on the Worker (`requireAdmin`, 403 otherwise). |
| `testLogicsConnection()` | `POST PATH/test` with `{}`. The Worker always calls live Logics with the stored credentials, whatever `LOGICS_MODE` says. Admin only. |

## Tests

Covered through `logics-settings-page.test.tsx`: the PUT body without `base_url` when blank and with it when typed, the status guard on the GET and PUT answers, and the three test results.
