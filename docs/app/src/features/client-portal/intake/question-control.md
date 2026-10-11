# `app/src/features/client-portal/intake/question-control.tsx`

`QuestionControl({ question, value, onChange })` renders the input for one intake question, chosen by `QUESTION_UI[question.id].control` (D-13). It holds no state; the intake step owns the value.

| Control | Rendering |
|---------|-----------|
| `yes_no` | Two full-width `Button size="xl"` (44 px): `Yes` (`true`) and `No` (`false`). |
| `choice` | One 44 px button per option, passing the option's value. For pay frequency these are Weekly, Every two weeks, Twice a month and Monthly. |
| `stepper` | `−` and `+` buttons (`aria-label` `Fewer` and `More`, `min-h-11 min-w-11`) around an `aria-live` `<output>`. With no value it shows the minimum. Each button is disabled at its bound. |
| `number` | One `Input` with `inputMode="numeric"`, `text-base` (16 px, so iOS does not zoom), `h-11`, at most 3 characters, labelled by the prompt. Non-digits are dropped, and an empty field gives `undefined`. Bounds are checked on Next by `validateClientAnswer`. |

The `pick(options)` helper renders `yes_no` and `choice`. The selected button uses the default variant and `aria-pressed={true}`; the others use `outline` and `aria-pressed={false}`.

Tests: `question-control.test.tsx`.
