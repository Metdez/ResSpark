# `app/worker/src/routes/admin-integrations.ts`

The firm-admin surface for Logics credentials (D-01, D-03, LOOK-05). Mounted in `index.ts` at `/api/admin/integrations`, it owns `GET /logics`, `PUT /logics/settings`, `PUT /logics`, and `POST /logics/test`. Every path runs behind `staffAuth`; the two writes also require the `admin` role.

| Lines | What it does |
|-------|--------------|
| 1-21 | Hono and `Context`, `HTTPException`, `logEvent`, the three `firm_integrations` helpers and the row type, `encryptSecret` and `keyHint`, `LogicsError`, the default base URL, `liveClientFromRow`, `validateLogicsBaseUrl`, the `LogicsMode` type, and `staffAuth`. |
| 23 | `AdminApp`: the route's Hono generics. |
| 25-27 | `requireAdmin`: 403 `forbidden` unless the verified staff role is `admin` (T-02-12). |
| 29 | `modeOf`: `fake` when `LOGICS_MODE` is `fake`, otherwise `live`. This is the mode `resolveLogicsClient` would serve right now; in `live` without tested credentials the lookup routes answer 409 `logics_not_configured`. |
| 31-32 | `hasCredentials`: both ciphertexts present. |
| 35-44 | `toStatus`: the only response shape. It is built from an explicit field list (`configured`, `base_url`, `key_hint`, `last_test_at`, `last_test_ok`, `updated_at`, `mode`), so ciphertext can never reach the browser (T-02-13). With no row, it reports the default base URL and nulls. |
| 45 | `nonBlank`: a string that is not empty after trimming. |
| 47-48 | `publicSettings`: the D-08 settings staff see (`file_category_id`, `activity_type`, `write_enabled`); `activity_types_seen` is returned separately as `activity_types`. |
| 50-65 | `SettingsPatch` and `parseSettings(body)`: a plain object whose every key is one of `file_category_id` (integer >= 1, or `null` to clear), `activity_type` (string, 1..60 characters after trim, stored trimmed), `write_enabled` (boolean), with at least one key. Anything else returns `null`, answered 400 `bad_request` (T-05-18). |
| 67-68 | The route instance and `staffAuth`. |
| 69-73 | `GET /logics`: any signed-in staff member can read the status, which the Settings page and the SPA's fixture label need. The response also carries `settings` (defaults `{ file_category_id: null, activity_type: 'General', write_enabled: false }`) and `activity_types` (the last Test connection listing, `[]` until then). |
| 74-89 | `PUT /logics/settings` (`PUT /api/admin/integrations/logics/settings`, admin only, T-05-17): `parseSettings`, then `updateSettings` (merge into `firm_integrations.settings`, creating the row if the firm has none yet), event `integration.logics.settings_updated` with payload `{ changed: [keys] }` (never values or credentials), 200 `{ settings }`. |
| 90-122 | `PUT /logics` (admin only): `api_key` and `secret_token` must be non-blank strings and `base_url`, when present, a string (400 `bad_request` otherwise). The base URL, or the default when blank, goes through `validateLogicsBaseUrl` for the current `APP_ENV` (400 `invalid_base_url`, T-02-14) and is stored with one trailing slash. Both values are trimmed and sealed with `INTEGRATION_ENC_KEY`. `key_hint` is the last four characters of the API key, the only credential-derived value that leaves the Worker. `upsertIntegration` writes the single `(firm_id, provider)` row, so two admins saving at once resolve last-writer-wins, and it resets the last test result. Returns the status shape. |
| 123-166 | `POST /logics/test` (admin only): 400 `no_credentials` without both ciphertexts. It always builds the live client from the stored row, even in `fake` mode, because proving the credentials is the point. It calls `Find/FindCaseByEmail` with the signed-in admin's email. Any HTTP 200 is `ok: true`, whatever the data. A `LogicsError` is `ok: false` with its status (401/403 means credentials rejected) or `null` for a network failure or a key that no longer decrypts. Any other error is rethrown (500). It then records the result on the row and logs `integration.logics.tested` with `{ ok, status }` only, never the email (T-02-15). Returns `{ ok, status, tested_at }`. After a successful Find probe, when `LOGICS_TEST_CASE_IDS` has a first id, the same live client calls `listActivities(Number(id))` (read-only `CaseActivity/Activity`, D-08). `{ activityTypes }` leads to `updateSettings({ activity_types_seen: sorted distinct })`; `{ kind: 'failed', status }` leaves settings unchanged and adds `activity_types_error: status` to the response. The listing never fails the test, because activity scopes may differ from Find scopes. |

## Notes

- Decryption happens only inside `liveClientFromRow`; this file never calls `decryptSecret`.
- Switching the Worker to `live` is a separate deliberate step: set `LOGICS_MODE` to `live` in `app/wrangler.jsonc` and redeploy (USER ACTION in `docs/app/README.md` § Logics mode).

## Tests

`app/worker/test/admin-integrations.test.ts` (credentials, Test connection, GET shape with the settings defaults) and `admin-integrations.test.ts` beside this file (settings PUT validation and admin-only check, GET defaults, the ActivityType listing on Test connection).
