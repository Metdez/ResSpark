# `app/src/features/client-portal/intake/intake-step.tsx`

`IntakeStep({ step, open, onClose })` shows the client intake as a full-height bottom sheet, one question per screen (Plan 07-08, D-13). `StepList` opens it for `kind === 'intake'`.

## State

- `useQuery(['portal', 'intake', step.id], getIntake)` while the sheet is open.
- `local` holds answers saved in this sheet, layered over the server's (`answers = { ...data.answers, ...local }`).
- `currentId` is the question on screen. When it is unset, or no longer applicable after an answer changed, the screen is the first unanswered question of `clientQuestionOrder(answers)`, or the last question when all are answered. That is how a reload resumes.
- `draft` is the client's unsaved pick for the current question.
- `error` is the inline error text.
- `heading` is a ref to the question heading, for focus.

## Value shown

The value is `draft` for this question, else the saved answer, else the prefill value, else (steppers only) the minimum. A prefill banner (`INTAKE_COPY.prefill[source]`) shows while the question is unanswered, has prefill, and the client has not changed it. Nothing is saved until Next.

## Flow

- **Next** checks `validateClientAnswer` locally (showing `Check your answer and try again.` when it fails), then calls `saveAnswer`. On success the answer joins `local`, the order is recomputed, and the next question in that order opens.
- **Done** is the label on the last question. It saves the answer, then calls `finishIntake`, invalidates `['portal', 'state']` so the row shows With your agent, and closes.
- **Back** goes to the previous question in the order without saving. It is disabled on the first question.
- A failed save or Done shows the error (`bad_value`, `incomplete` or generic) through `errorText` and stays on the question.
- The question heading (`data-question={id}`, `tabIndex=-1`) takes focus on every new screen, so screen readers announce it.
- The header shows the step label, then `Question i of n · Section`.
- A 44 px Close button sits at the bottom. The vendored 16 px icon close is hidden, as in the other client sheets.

Tests: `intake-step.test.tsx`.
