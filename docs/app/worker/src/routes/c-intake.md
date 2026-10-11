# `app/worker/src/routes/c-intake.ts`

The client intake routes (Plan 07-08; D-13, D-19, FORM-02), mounted at `/api/c` in `index.ts`. Identity is the `rs_client` cookie only (`clientSession`), and the case and item come from that session. Answers are written as `financial_proposals` with source `intake`, never into `case_financial_data` (D-05, D-06). Staff accept them on the 433-A view.

## Helpers

| Part | What it does |
|------|--------------|
| `fail(c, status, code, message, extra?)` | Sets `errorCode` for the logger and answers `{ error: { code, message }, ...extra }`. |
| `noItem` | 404 `no_intake_item`. |
| `isObject` | Plain-object check for the JSON body. |
| `QUESTIONS_OUT` | The 23 client questions with their UI metadata (`id`, `prompt`, `type`, `section`, `control`, `options?`, `minimum?`, `maximum?`), computed once. |
| `session_` | Runs `clientSession` only when no client is set yet (the same per-route pattern as `c-address.ts`). |

## Routes

| Route | Behaviour |
|-------|-----------|
| `GET /intake` | 200 `{ item: { id, status }, questions, answers, prefill }`. `answers` comes from `listAnswers`. `prefill` comes from `listPrefill` and leaves out answered columns. 401 without a session, 404 `no_intake_item`. |
| `PUT /intake` | Requires `X-Requested-With: ResSpark` (403 `bad_origin`). Allows 60 saves a minute per link under the key `intake:<linkId>` (429 `rate_limited`). The body must be `{ question_id, value }`, else 400 `bad_request`. `validateClientAnswer` gives 400 `unknown_question` or `bad_value` before any database call. Answers 409 `item_approved` once staff have approved the item. Then calls `upsertProposals` with source `intake`, generator `intake`, `scopeColumns: [question_id]` (only this question's old proposal can be superseded), method `client_answer`, reliability `C`, one `intake_answer` source ref pointing at the item, and actor `client` with the link id. A database `bad_value` also maps to 400. A `pending` item moves to `in_progress`. Answers 200 `{ saved: true }`. |
| `POST /intake/done` | Same header check. Recomputes `clientQuestionOrder(answers)`. Any unanswered applicable question gives 400 `incomplete` with `missing: string[]`. Otherwise calls `submitIntake` (item `submitted`, request status recomputed), then `JOBS.send({ type: 'financials_propose', ref: caseId, reason: 'intake_done' })` (D-07). A queue failure is logged as `financials.enqueue_failed` and does not fail the client's Done. Answers 200 `{ item_status, request_status }`. |

## Tests

- `c-intake.test.ts` (project `worker-node`, db and RPC mocked) covers the header, the validation codes, `incomplete`, the proposal payload and the enqueue.
- `app/worker/test/intake-live.test.ts` runs the whole path against the live project.
