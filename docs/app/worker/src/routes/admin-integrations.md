# `app/worker/src/routes/admin-integrations.ts`

The firm-admin surface for Logics credentials (D-01, D-03, LOOK-05). Mounted in `index.ts` at `/api/admin/integrations`, it owns `GET /logics`, `PUT /logics`, and `POST /logics/test`. Every path runs behind `staffAuth`; the two writes also require the `admin` role.

| Lines | What it does |
|-------|--------------|
| 1-13 | Hono and `Context`, `HTTPException`, `logEvent`, the three `firm_integrations` helpers and the row type, `encryptSecret` and `keyHint`, `LogicsError`, the default base URL, `liveClientFromRow`, `validateLogicsBaseUrl`, the `LogicsMode` type, and `staffAuth`. |
| 15 | `AdminApp`: the route's Hono generics. |
| 17-19 | `requireAdmin`: 403 `forbidden` unless the verified staff role is `admin` (T-02-12). |
| 21 | `modeOf`: `fake` when `LOGICS_MODE` is `fake`, otherwise `live`. This is the mode `resolveLogicsClient` would serve right now; in `live` without tested credentials the lookup routes answer 409 `logics_not_configured`. |
| 23-24 | `hasCredentials`: both ciphertexts present. |
| 26-35 | `toStatus`: the only response shape. It is built from an explicit field list (`configured`, `base_url`, `key_hint`, `last_test_at`, `last_test_ok`, `updated_at`, `mode`), so ciphertext can never reach the browser (T-02-13). With no row, it reports the default base URL and nulls. |
| 37 | `nonBlank`: a string that is not empty after trimming. |
| 39-40 | The route instance and `staffAuth`. |
| 41-44 | `GET /logics`: any signed-in staff member can read the status, which the Settings page and the SPA's fixture label need. |
| 45-77 | `PUT /logics` (admin only): `api_key` and `secret_token` must be non-blank strings and `base_url`, when present, a string (400 `bad_request` otherwise). The base URL, or the default when blank, goes through `validateLogicsBaseUrl` for the current `APP_ENV` (400 `invalid_base_url`, T-02-14) and is stored with one trailing slash. Both values are trimmed and sealed with `INTEGRATION_ENC_KEY`. `key_hint` is the last four characters of the API key, the only credential-derived value that leaves the Worker. `upsertIntegration` writes the single `(firm_id, provider)` row, so two admins saving at once resolve last-writer-wins, and it resets the last test result. Returns the status shape. |
| 78-106 | `POST /logics/test` (admin only): 400 `no_credentials` without both ciphertexts. It always builds the live client from the stored row, even in `fake` mode, because proving the credentials is the point. It calls `Find/FindCaseByEmail` with the signed-in admin's email. Any HTTP 200 is `ok: true`, whatever the data. A `LogicsError` is `ok: false` with its status (401/403 means credentials rejected) or `null` for a network failure or a key that no longer decrypts. Any other error is rethrown (500). It then records the result on the row and logs `integration.logics.tested` with `{ ok, status }` only, never the email (T-02-15). Returns `{ ok, status, tested_at }`. |

## Notes

- Decryption happens only inside `liveClientFromRow`; this file never calls `decryptSecret`.
- Switching the Worker to `live` is a separate deliberate step: set `LOGICS_MODE` to `live` in `app/wrangler.jsonc` and redeploy (USER ACTION in `docs/app/README.md` § Logics mode).

## Tests

`app/worker/test/admin-integrations.test.ts`.
