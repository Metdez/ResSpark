# `app/worker/src/routes/admin-worksheet.ts`

Staff routes for the 433-A screening worksheet (Plan 07-06, D-16, FORM-06). Mounted at `/api/admin` in `index.ts`, right after the financials routes. `staffAuth` is scoped to `/cases/*`, and the firm always comes from the verified staff context, never from the request.

| Part | What it does |
|------|--------------|
| `UUID` / `uuidParam(c, name)` | Validates a path id. A malformed id answers 404 `not_found`, the same as a missing or foreign one (T-07-15). |
| `POST /cases/:id/evaluations/:runId/worksheet` | Calls `exportWorksheet` with the staff firm and user id. Answers 201 with `{ document_id, file_name, pages, request_id, already: false }` on the first export, 200 with the same document and `already: true` on a re-export, 404 when the run does not belong to this case and firm, and 409 `worksheet_in_progress` while a concurrent export of the same run is still uploading. Other errors fall through to `onError`'s 500 envelope. |
| `GET /cases/:id/worksheets` | `listCaseWorksheets`: `{ request_id, worksheets: [...] }`, or 404 for a case outside the firm. The push card uses it to show the `433-A worksheets` group on the request whose id equals `request_id`. |

Tests: `app/worker/test/worksheet.test.ts` (live).
