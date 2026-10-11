---
phase: 07-433-a-pre-population
plan: 08
subsystem: client-portal, worker, shared
tags: [intake, form-02, proposals, client-portal]
requires: [07-01 shared/questions.ts, 07-02 financial_proposals_upsert + intake_submit, 07-05 financials_propose job]
provides:
  - "QUESTION_UI, CLIENT_QUESTION_IDS (23), PREFILL_COLUMNS, clientQuestionOrder, validateClientAnswer in app/shared/questions.ts"
  - "GET/PUT /api/c/intake, POST /api/c/intake/done (routes/c-intake.ts, db/intake.ts)"
  - "IntakeStep one-question-per-screen sheet, QuestionControl, intake-api, intake-copy"
  - "seedPortalItems kind 'intake'"
affects: [07-09 (staff sees intake proposals), 07-10]
key-files:
  created:
    - app/worker/src/db/intake.ts
    - app/worker/src/routes/c-intake.ts
    - app/worker/src/routes/c-intake.test.ts
    - app/worker/test/intake-live.test.ts
    - app/shared/questions.test.ts
    - app/src/features/client-portal/intake/{intake-api,intake-copy}.ts
    - app/src/features/client-portal/intake/{question-control,intake-step}.tsx (+ tests, intake-api.test.ts)
    - docs for each under docs/
  modified:
    - app/shared/questions.ts, app/worker/src/index.ts, app/worker/test/fixtures/portal-items.ts
    - app/src/features/client-portal/step-list.tsx (+ test), app/vitest.config.ts
decisions:
  - "Client question order: the 16 client ids of INITIAL_QUESTION_IDS, then dependents_count, pay_frequency, the five remaining compliance questions; 20 questions with no answers"
  - "Steppers with no answer show and offer their minimum; the client confirms it with Next (visible, not a silent default)"
  - "PUT refuses with 409 item_approved once staff approved the intake item"
  - "Prefill also drops values the phone could not pick (validateClientAnswer fails)"
  - "Task 3 (remove src/frontend/) NOT run: vercel.json on main builds and serves src/frontend/"
status: complete
duration: 39min
completed: 2026-10-11
actuals:
  tokens: 20200
  tasks: 2
  commits: 13  # measured on the shared tree; 2 are 07-08's (588e8e6, 79fc13a), the rest other executors'
plan_head_before: ef853d577c7822f76580ed085eab74885e4a92a6
plan_head_after: 5e4776f165324dadf0affd807b2a1a23784a436d
---

# Phase 7 Plan 08: Client intake in the portal Summary

The client portal's `intake` step is now a one-question-per-screen phone flow. Each answer is saved through `PUT /api/c/intake` as a `financial_proposals` row with source `intake` and reliability C, so it is never a case value. Truv and Logics A-reliability prefill covers four columns. Done submits the item through `intake_submit` and enqueues `financials_propose` with reason `intake_done`. A live test proves the 28-question contract against `question_definitions`.

## Tasks
- **Task 1 (tracer), `588e8e6`:** shared helpers, `db/intake.ts`, `routes/c-intake.ts`, the index mount, the fixture `intake` kind, and the live test. On the SPA side: intake-api, intake-copy, QuestionControl (all four controls), IntakeStep, the StepList branch, and docs. The tracer gate re-ran its verify and it passed: web client-portal 159/159, live 5/5. Execution then continued (auto mode).
- **Task 2, `79fc13a`:** `shared/questions.test.ts` (with `shared/**/*.test.ts` added to the `web` project), question-control, intake-step resume/prefill/error/back, intake-api, and the `c-intake` route unit tests, plus docs. Results: web 33/33, worker-node 15/15. The live prefill and parity cases were already in the live file (5/5).
- **Task 3: skipped** (see Deferred).

## Facts the plan asked to record
- **Client question count and order:** 23 client questions (all 28 except `state_of_residence`, `county_of_residence`, `total_tax_owed`, `tax_only_balance`, `csed_months_remaining`). The order is `filing_status_married`, `filing_joint_offer`*, `household_size`, `age_taxpayer`, `age_spouse`*, `owns_home`, `rents_home`*, `is_wage_earner`, `is_self_employed`, `vehicle_count`, the four `has_*`, `all_returns_filed`, `in_open_bankruptcy`, then `dependents_count`, `pay_frequency`*, `filed_bankruptcy_past_7yrs`, `in_litigation`, `prior_ia_or_oic_default`, `filed_and_paid_timely_last_5_years`, `installment_agreement_last_5_years`. Entries marked * are conditional: married; not owning a home; `is_wage_earner !== false`. A client who answers nothing yet sees 20 questions.
- **Task 3:** not run. This was a scope change from the orchestrator, not a precondition stop. No files were removed.
- **Env-file follow-up:** `test:live`, `test:live:file`, `test:rls`, `smoke:*`, `deploy` and `secrets:*` in `app/package.json` still read `../src/frontend/.env`. If `src/frontend/` is ever removed, those keys must move first (USER ACTION).

## Deferred — needs user decision: remove src/frontend/ (breaks the Vercel deployment on main)
Plan Task 3 (D-04) would `git rm -r src/frontend docs/src/frontend`. Since the plan was written, the merge from origin/main added `vercel.json`, which builds and serves `src/frontend/` (`npm --prefix src/frontend run build`, output `src/frontend/dist`) for the teammate's Vercel deployment. `app/package.json` scripts also load `src/frontend/.env`. Removing it would break that deployment, so the decision goes to the user. The must-have "the frozen `src/frontend/` and `docs/src/frontend/` are removed" is therefore **not met**. `app/shared/questions.ts` is still the only question source the new app uses.

## Deviations from Plan
1. **[Plan wording] Married ordering:** the Task 2 behavior says `filing_joint_offer` and `age_spouse` both appear "right after" marital status. Under the plan's own rule (`INITIAL_QUESTION_IDS` first), `age_spouse` comes right after `age_taxpayer`. The test asserts that, and `filing_joint_offer` directly follows marital status.
2. **[Order] Controls in Task 1:** QuestionControl shipped with all four controls in Task 1, not yes/no only. Task 2 added their tests.
3. **[Rule 2] 409 `item_approved` on PUT:** an answer cannot reopen an item staff already approved (mirrors `c-address`).
4. **[Rule 2] Own-property check:** `validateClientAnswer` uses an own-property lookup, so a body `question_id` such as `toString` or `__proto__` is `unknown_question`. This sits at the trust boundary (T-07-35).
5. **[Contract] GET `questions`:** the route returns the 23 questions with UI metadata as specified. The SPA reads prompts and controls from `app/shared/questions.ts` instead (single source), and its guard ignores that key.
6. **Live test timeout:** the full-answer case makes about 20 sequential live saves (~315 ms each), so it has a 60 s timeout.
7. **Docs for test files:** companion docs were added for every new test file. The plan listed only the live test's doc.

## Issues / notes
- `pnpm -C app run check`: file sizes and the golden check pass. `tsc -b` fails only in 07-07's uncommitted files (`worker/src/financials/propose/{bank,payroll}.test.ts`, `worker/test/financials-bank-payroll.test.ts`), which stops the chain. Run separately, `eslint .` gives warnings only, none in 07-08 files, and `pnpm test` passes 1897 with 235 skipped.
- The live test deletes `intake`/`truv`/`logics` proposals on the fixed portal case (`…0e6`) before and after its run. Cases are never deleted.
- No deploy.

## Self-Check: PASSED
- Files: c-intake.ts, db/intake.ts, intake-live.test.ts, intake-step.tsx, question-control.tsx, intake-api.ts, intake-copy.ts and questions.test.ts all present.
- Commits: 588e8e6 and 79fc13a are ancestors of HEAD.
