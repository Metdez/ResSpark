# `app/worker/test/admin-lookup.test.ts`

Route tests for `routes/admin-lookup.ts` through `app.request()` (worker-node project). `db/staff`, `db/events`, `db/integrations`, and `db/cases` are mocked. Global `fetch` serves the stubbed JWKS for the Supabase URL and a per-test Logics response for everything else.

| Part | What it does |
|------|--------------|
| Mocks and constants | The firm, staff user, and case UUIDs, a Supabase URL, an all-zero test encryption key, and `env(mode)` building the Worker env with `LOGICS_MODE`. |
| `token()` | Signs a staff JWT with a locally generated ES256 key. Same helper shape as `auth.test.ts`, kept local per the plan (extract it once a fourth file needs it). |
| `call` / `lookup` / `errorCode` | Request helpers; `auth: false` drops the bearer and `mode` switches fake/live. |
| `beforeEach` | Captures log lines, routes `fetch`, resolves the staff profile as the demo admin, `getIntegration` → `null`, and `confirmLogicsCase` → the case UUID. |
| `testedRow()` | A firm row with real `encryptSecret` ciphertexts and `last_test_ok: true`, for live-mode tests. |
| fixture mode | 401 without a token; the shared fixture phone returns two cards labeled `fake` with no `DOB`; last name plus phone; email; case id; unknown case id → `[]`; five 400 `bad_request` shapes with no `getIntegration` call; `phone_invalid` with log lines free of the search value and type; `email_invalid`. |
| live mode | 409 `logics_not_configured` with no row; Logics 401 → 502 `logics_unauthorized`; two network failures → 502 `logics_unreachable`; `Success:false` → `{ results: [], mode: 'live' }`. |
| confirm | Body `first_name` and `case_id` are ignored and the RPC receives the CaseInfo values, phone `+15550100001`, firm, actor, and search type; unknown id → 404 `case_not_found` with no write; `abc` → 400; bad `search_type` → 400; live with no credentials → 409. |
| GET case | Seven fields without the snapshot and a firm-scoped `getCase` call; `null` → 404 `not_found`; non-UUID → 400. |
