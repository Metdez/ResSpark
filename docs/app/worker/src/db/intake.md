# `app/worker/src/db/intake.ts`

Data access for the client intake routes (Plan 07-08, D-13). Uses the service-role client from `db/client.ts`. Every query is scoped by the cookie session's firm and request, never by an id from the request body (T-07-34).

| Part | What it does |
|------|--------------|
| `AnswerValue` | `boolean \| number \| string`, the JSON forms a client answer can take. |
| `IntakeContext` | `{ caseId, item: { id, status } }`. |
| `intakeContext(env, { requestId, firmId })` | Reads the session's request through `sessionRequest` (`requests.id` and `firm_id` must both match), then the request's first `intake` item by position. Returns `null` when either is missing; the route then answers 404 `no_intake_item`. |
| `listAnswers(env, firmId, caseId)` | The client's answers: `financial_proposals` with source `intake`, status other than `superseded`, column among `CLIENT_QUESTION_IDS`, newest first. The first row per column wins. A row that staff accepted, edited or rejected still holds the client's own `proposed_value`, so it still counts as answered. |
| `listPrefill(env, firmId, caseId, answered)` | Prefill for the phone: sources `truv` or `logics`, reliability `A`, status `proposed` or `accepted`, column in `PREFILL_COLUMNS`, newest first, one per column. It skips a column the client already answered. It also skips a value the phone could not pick, where `validateClientAnswer` fails (for example an unknown pay frequency). Liability values such as `total_tax_owed` can never appear (T-07-37). |
| `markItemInProgress(env, itemId)` | Moves `pending` to `in_progress` only (the `.eq('status', 'pending')` guard), as the upload path does on a first file. |
| `submitIntake(env, { itemId, requestId, linkId })` | Calls the 0008 RPC `intake_submit`. The RPC marks the item `submitted`, logs `intake.submitted` and recomputes the request status. Returns `{ item_status, request_status }`. A database error naming `item_not_found` becomes `Error('item_not_found')`. Any other error is `intake_submit_failed`; the database message is never surfaced. |
