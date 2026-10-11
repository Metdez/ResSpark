# `app/worker/test/worksheet.test.ts`

Live test of the worksheet export (FORM-06, D-16) against the Supabase project. Run it with `pnpm -C app run test:live:file worker/test/worksheet.test.ts`. When `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing, the suite skips and prints a note to stderr. Everything runs under test firm `…000e`.

| Part | What it does |
|------|--------------|
| `STAFF_ID` + `vi.mock('../src/middleware/staff-auth')` | Sets a fixed staff context (test firm, `Test agent`), the same pattern as `financials-api.test.ts`. |
| `COMPLETE` / `ROW` | The complete golden row (`test_complete_database_row_reaches_v2_determination`) in `CA` / `Los Angeles County` with household 1. |
| `logicsId()` | A random 9-digit Logics CaseID, so seeded cases never collide. |
| `call` | `app.request` with the test env (plus overrides) that returns the status and JSON. |
| `seed` / `exported()` | `seedFinancialCase` with a request and one item. `exported()` evaluates the case (201), exports the run once, and records the storage path for cleanup. |
| `worksheets(caseId)` | The case's `worksheet_433a` documents rows. |
| `enableFirmWrites(db)` | Turns on the test firm's Logics `write_enabled` toggle (D-08) for the push case and returns a restore function, copied from `logics-push.test.ts`. |
| `afterAll` | Removes the stored PDFs, then each fixture's `cleanup()` (documents, runs, rows, request). Cases and events stay, by the fixture's rule. |

## Cases

1. **Export, re-export, list, foreign run.**
   - The first POST answers 201. `request_id` is the seeded request, `already` is false, `pages >= 1`, and the file name has the form `433A-screening-worksheet-<CaseID>-<date>.pdf`.
   - Exactly one `documents` row exists: `ready`, `request_item_id` NULL, `application/pdf`, storage key `firm/<firm>/case/<case>/worksheets/<run>.pdf`, a 64-hex `sha256` and `size_bytes > 0`. `headBytes` of the object starts with `%PDF-`.
   - Exactly one `worksheet.generated` event exists, with payload keys `document_id`, `pages` and `run_id`. The page count of the live sample is printed to stderr.
   - A second POST answers 200 with the same `document_id`, the same page count and file name, and `already: true`. Still only one row.
   - GET `/worksheets` lists that document with its `run_id`.
   - The same run id posted under another case answers 404 and stores nothing.
2. **Push like any document (fake mode, D-16).** The test exports worksheets for two cases. `POST /api/admin/requests/<case A request>/logics-push` with case B's worksheet answers 422 `not_pushable` (T-07-27). With case A's worksheet, it answers 202 `mode: 'fake'`, creates exactly one `logics_pushes` row (`queued`, `fake`, that document, case A) and sends one queue message to the stubbed `JOBS`. The env sets `LOGICS_MODE: 'fake'`, so nothing reaches Logics. The firm toggle is restored in `finally`. Both cases use a 30 s timeout, because each export evaluates and renders live.
