# `app/worker/test/financials-api.test.ts`

Live test of the 433-A admin routes (FORM-04 and FORM-05) against the Supabase project. Run it with `pnpm -C app run test:live:file worker/test/financials-api.test.ts`. When `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing, the suite skips and prints a note to stderr.

| Part | What it does |
|------|--------------|
| `STAFF_ID` + `vi.mock('../src/middleware/staff-auth')` | Replaces `staffAuth` with a middleware that sets `{ userId: STAFF_ID, firmId: TEST_FIRM, role: 'admin', displayName: 'Test agent' }`. This follows the Phase 5 `logics-push.test.ts` pattern. |
| `golden` / `COMPLETE` | The complete canonical row from the golden fixture case `test_complete_database_row_reaches_v2_determination`. The fixture is read with `readFileSync`, so `tsc` never has to type the large JSON. |
| `baseRow(over)` | The complete row moved to `CA` / `Los Angeles County`, plus overrides. |
| `seed` | Calls `seedFinancialCase` (a fresh case under test firm `…000e`) and records the fixture for cleanup. |
| `call` | Wraps `app.request(path, init, env)` and returns the status and JSON body. |
| `runs` / `lineOf` | Read the stored runs for a case, and find one line in a view. |
| `afterAll` | Each fixture's `cleanup()` removes proposals, the row and runs. Cases and events stay, because `events.case_id` has no ON DELETE. |

## Cases

1. **Tracer.** The test seeds a case with `household_size` NULL and adds an `intake` proposal of 1.
   - GET financials: the line is `proposed` with that proposal, and `required.missing` is `['household_size']`.
   - Decide `accept` returns 200.
   - GET financials again: the line is `confirmed` with `source 'intake'` and `by_name 'Test agent'`, and `required.confirmed === required.total === 63`.
   - POST evaluations returns 201. `path`, `reason` and the suggested amount match a test-side `evaluateCase` on the same live bundle and row. `standards_inputs.housing` is 3001, `next` is the review sentence, there are 7 NRE lines, `engine_version` is set, and `created_by_name` is 'Test agent'.
   - Exactly one `determination_runs` row exists, with `firm_id = TEST_FIRM` and `created_by = STAFF_ID`. PostgREST numerics come back as JSON numbers. Exactly one `evaluation.created` event exists, and its payload values are all strings (no amounts).
   - GET evaluations/latest returns that run.
2. **Missing fact.** With `age_spouse` NULL, POST evaluations returns 200 `information_needed`. The response lists `age_spouse` with its label `Spouse age` and carries no amounts, and no run row is written.
3. **Unknown county.** With county `Nowhere County`, POST evaluations returns 200 `standards_unavailable`, and no run row is written.
