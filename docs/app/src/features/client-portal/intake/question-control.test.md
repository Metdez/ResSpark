# `app/src/features/client-portal/intake/question-control.test.tsx`

Unit tests for `QuestionControl` (project `web`). `render(id, value)` mounts the control with `createRoot` + `act` and returns the `onChange` spy. `buttons`, `byText` and `byLabel` find buttons by text or `aria-label`.

- **Yes/no** (`owns_home`, value `false`): buttons `Yes`, `No`; `No` has `aria-pressed="true"`; both are 44 px (`h-11`); tapping Yes calls `onChange(true)`.
- **Choice** (`pay_frequency`): the four labels in order; tapping `Every two weeks` passes `biweekly`.
- **Stepper** (`household_size`, no value): shows 1, `Fewer` is disabled at the minimum, both buttons are `min-h-11`, and `More` passes 2.
- **Stepper at the maximum** (`vehicle_count`, 50): `More` is disabled and `Fewer` passes 49.
- **Number** (`age_taxpayer`, 40): `inputmode="numeric"`, `text-base`, labelled by the prompt, shows 40. Typing `4a5` passes 45, and clearing passes `undefined`.
