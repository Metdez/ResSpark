# `app/worker/test/admin-integrations.test.ts`

Route tests for `routes/admin-integrations.ts` through `app.request()` (worker-node project). `db/staff`, `db/events`, and `db/integrations` are mocked; the integration helpers share one in-memory row. Global `fetch` serves the stubbed JWKS for the Supabase URL and records every other (Logics) request before answering with the per-test response.

| Part | What it does |
|------|--------------|
| Constants | One firm, an admin (`zack@resspark.test`) and a staff user (`andrew@resspark.test`), an all-zero test encryption key, and `env(mode)`. |
| `token(sub)` | Signs a staff JWT for either user, the helper shape from `auth.test.ts`. |
| `call` / `put` / `runTest` | Request helpers under `/api/admin/integrations`. |
| `storedRow()` | A row with real `encryptSecret` ciphertexts, overridable per test. |
| `beforeEach` | Resets the row and the outbound list, silences the logger, picks the profile role by user id, and wires the in-memory `getIntegration`/`upsertIntegration` (which clears the test result, like the real one). |
| GET | Staff read with no row → the full default shape with `mode: 'fake'`; live mode with a tested row → `mode: 'live'`, `configured: true`, and no ciphertext in the body. |
| PUT | Staff → 403 with no write; admin → encrypted values (decryptable back to the input), `key_hint` `1234`, default base URL, the admin as `updated_by`, and a body with no key, no `_ciphertext`, and no `S` value; four 400 `bad_request` shapes; `http://evil.example/` → 400 `invalid_base_url`; a URL without a trailing slash is stored with one. |
| POST test | Staff → 403 with no Logics call; no row → 400 `no_credentials`; 200 → `{ ok: true, status: 200 }`, `recordIntegrationTest(true)`, and an `integration.logics.tested` event whose payload is exactly `{ ok: true, status: 200 }` (no `@`), sent live to `Find/FindCaseByEmail` with the admin's email header even though `LOGICS_MODE` is `fake`; 401 → `ok: false, status: 401` recorded as false; two network failures → `status: null` after exactly two attempts. |
