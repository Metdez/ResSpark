# `app/worker/test/intake-live.test.ts`

Live test of the client intake (Plan 07-08, FORM-02). It is skipped unless `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `CLIENT_LINK_HMAC_KEY` are set. Run it with `pnpm -C app run test:live:file worker/test/intake-live.test.ts`.

## Setup

- `seedPortalItems(env, { kinds: ['intake'] })` gives an opened request with one `intake` item on the fixed portal test case, plus a cookie from a minted link.
- Any `intake`, `truv` or `logics` proposals already on that case are deleted. Then `upsertProposals` seeds two: a Truv A `is_wage_earner = true`, which must be prefilled, and a Logics A `total_tax_owed = 12345`, which must never reach the phone.
- `env.JOBS.send` is a `vi.fn`, so the test sees the enqueue.
- `afterAll` deletes those proposals again and runs the fixture cleanup, which removes the request and its rows. The case stays.
- `answerFor(id)` gives a fixed answer per control: every yes/no is No, a choice gets its first option, an age gets 40, and a stepper gets its minimum.
- `get`, `put`, `done` and `itemStatus` are small request and query helpers.

## Cases

1. `GET` returns 23 questions, the item as `pending`, no answers, and prefill exactly `{ is_wage_earner: { value: true, source: 'truv' } }`.
2. `PUT household_size = 3` returns `{ saved: true }`. Exactly one intake proposal exists (value 3, reliability C, status proposed, one `intake_answer` ref to the item). The item is `in_progress`, and `GET` resumes with `answers.household_size === 3`.
3. `household_size = 0` gives 400, `total_tax_owed` gives 400 `unknown_question`, and a PUT without the header gives 403.
4. `Done` first answers 400 with `missing` starting at `filing_status_married` and without `household_size`. Then every applicable question is answered in `clientQuestionOrder` order, so `pay_frequency` is skipped and `rents_home` is asked. `Done` returns `item_status: 'submitted'`, the item is submitted, `JOBS.send` saw the `intake_done` job, and the case has no `case_financial_data` row. This case has a 60 s timeout for about 20 sequential saves.
5. `question_definitions`, read with the service role, has 28 rows, and `QUESTIONS` matches them on id, prompt and `value_type`.
