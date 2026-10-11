# `app/worker/src/routes/admin-extract.ts`

The staff route that reads a case's uploaded PDFs into 433-A proposals (FORM-03, D-17). It is mounted under `/api/admin` in `index.ts`, after the worksheet route and before the lookup route.

| Part | What it does |
|------|--------------|
| Imports | Hono, `extractCaseDocuments` (the work, in `financials/extract-proposals.ts`), `staffAuth`, and the shared `notFound` error and `AdminApp` type from `admin-requests.ts`. |
| `UUID` | The case id pattern. A malformed id answers 404, like a missing or foreign case (T-07-49). |
| `.use('/cases/:id/financials/extract', staffAuth)` | Staff sign-in on this one path only, so the middleware does not run again for sibling admin routes. `staffAuth` also skips when `staff` is already set. |
| `POST /cases/:id/financials/extract` | Runs `extractCaseDocuments` with the session's firm and user. `null` (case not in the firm) answers 404 `not_found`; otherwise 200 with the `ExtractResult` JSON: counts, failed and skipped files by id and name with a fixed reason code, and the proposal upsert counts. No extracted text is ever returned. |

Errors from storage or the database reach `app.onError`, which answers a generic 500 without the message.
