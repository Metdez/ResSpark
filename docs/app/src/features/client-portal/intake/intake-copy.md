# `app/src/features/client-portal/intake/intake-copy.ts`

`INTAKE_COPY` holds every string the intake step shows except the question prompts, which stay verbatim in `app/shared/questions.ts`. Client voice per UI-SPEC: second person, sentence case, no exclamation marks.

| Key | Use |
|-----|-----|
| `progress(i, n)` | `Question i of n`, shown under the sheet title with the section name. |
| `yes`, `no` | The yes/no buttons. |
| `back`, `next`, `done`, `close`, `saving` | Navigation buttons. `Done` replaces `Next` on the last question. `Saving…` shows while a save or Done runs. |
| `fewer`, `more` | The `aria-label`s of the stepper buttons. |
| `prefill.truv`, `prefill.logics` | `We filled this in from your payroll. Tap to change.` and `We filled this in from your case file. Tap to change.` (D-13). |
| `loading`, `loadFailed` | Shown while loading, and when `GET /api/c/intake` fails. |
| `badValue`, `incomplete`, `saveFailed` | Inline errors: a 400 `bad_value` or an invalid local value; a 400 `incomplete` on Done; anything else. |
