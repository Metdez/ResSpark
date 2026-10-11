# `app/src/features/client-portal/intake/intake-step.test.tsx`

Component tests for `IntakeStep` (project `web`), using the `renderWithQuery` harness with `fetch` answered from a `'METHOD /path'` table.

## Helpers

- `state(answers, prefill)` builds a `GET /api/c/intake` reply; `SAVED` is the PUT reply.
- `question()` reads the `data-question` id of the screen; `puts(fetchMock)` lists the PUT bodies.
- `open(replies, onClose)` renders the sheet and waits for the first question.
- `invalidate` spies on `QueryClient.invalidateQueries`.

## Tracer

- The first screen is `Are you married?` with `Question 1 of 20` in a full-height (`h-dvh`) sheet. Tapping No then Next saves `{ question_id: 'filing_status_married', value: false }` and shows the household-size prompt.
- With every other question answered, the screen is `installment_agreement_last_5_years`. No then Done saves it, posts `/api/c/intake/done`, invalidates `['portal', 'state']` and closes.

## Resume, prefill and errors

- With three answers saved, it opens at `owns_home` as `Question 4 of 20`.
- A Truv `is_wage_earner` prefill preselects Yes and shows the payroll note. Nothing is saved until Next, which saves `true` and moves to `is_self_employed`.
- A Logics prefill shows the case-file note, and tapping a different answer hides it.
- A 400 `bad_value` on save shows `Check your answer and try again.` in an alert and stays on the question.
- Back returns to the previous question, shows its saved answer, and saves nothing.
