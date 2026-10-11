# `app/shared/questions.test.ts`

Unit tests for the client intake helpers in `app/shared/questions.ts` (Plan 07-08). They run in the `web` project, which includes `shared/**/*.test.ts`.

- `STAFF_ONLY` lists the five questions the client is never asked.
- 28 questions in total, 23 of them for the client, none of them in `STAFF_ONLY`.
- With no answers, `clientQuestionOrder` starts at `filing_status_married`, leaves out `filing_joint_offer` and `age_spouse`, and has 20 entries.
- Married: `filing_joint_offer` comes right after marital status, and `age_spouse` right after `age_taxpayer` (the `INITIAL_QUESTION_IDS` order).
- Initial questions come before follow-ups, and the last question is `installment_agreement_last_5_years`.
- `owns_home: true` drops `rents_home`; `owns_home: false` asks it.
- `is_wage_earner: false` drops `pay_frequency`; `true` asks it.
- A table of `validateClientAnswer` cases: household size 0 and 2.5 are `bad_value` and 2 is fine; age 121 is `bad_value` and 0 is fine; pay frequency `yearly` is `bad_value` and `biweekly` is fine; `state_of_residence` and `toString` are `unknown_question`; `owns_home` `'yes'` is `bad_value` and `false` is fine.
