# `app/worker/src/routes/c-intake.test.ts`

Unit tests for `routes/c-intake.ts` (project `worker-node`, no network). `db/intake`, `db/events` and `upsertProposals` are mocked; `FinancialRpcError` stays real. `requireClientHeader` is real, and `clientSession` is replaced by a middleware that sets link `L1`, request `R1`, firm `F1`. `ENV.JOBS.send` is a `vi.fn`. `COMPLETE` is a full answer set (not married, renting, not a wage earner) that lets Done pass.

## GET

- Returns 23 questions, the first being `filing_status_married` with control `yes_no` and its verbatim prompt, plus the prefill from `listPrefill`. The context lookup gets the session's request and firm.
- Answers 404 `no_intake_item` when `intakeContext` returns `null`.

## PUT

- 403 without the header, and nothing is saved.
- 400 `unknown_question` for `state_of_residence`, `bad_value` for household size 0 and for `'yes'` on a yes/no, `bad_request` for a body missing `value` or `question_id`. Nothing is saved.
- A valid answer calls `upsertProposals` with the exact intake payload (scope `[question]`, method `client_answer`, reliability `C`, the `intake_answer` ref, actor `client`/`L1`), and `markItemInProgress` gets the item.
- 409 when the item is `approved`.
- A `FinancialRpcError('bad_value')` from the database maps to 400 `bad_value`.

## Done

- 403 without the header.
- 400 `incomplete` when married with only household size answered: `missing` starts with `filing_joint_offer`, `age_taxpayer` and leaves out `household_size`; nothing is submitted.
- With `COMPLETE`, answers `{ item_status, request_status }`, submits with the session's ids, and enqueues `{ type: 'financials_propose', ref: 'C1', reason: 'intake_done' }`.
- A failing `JOBS.send` still answers 200 and logs `financials.enqueue_failed`.
