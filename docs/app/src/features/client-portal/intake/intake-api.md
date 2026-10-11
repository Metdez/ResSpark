# `app/src/features/client-portal/intake/intake-api.ts`

Typed calls for the intake step. They mirror `app/worker/src/routes/c-intake.ts` without importing it, like the other client API files. All of them go through `portalFetch`: same-origin cookie, `X-Requested-With: ResSpark`, and a `PortalError { status, code }` on failure.

| Part | What it does |
|------|--------------|
| `AnswerValue`, `PrefillSource` | `boolean \| number \| string` and `'truv' \| 'logics'`. |
| `IntakeState` | `{ item, answers, prefill }`. The route also returns `questions`, but the phone reads prompts and controls from `app/shared/questions.ts`, so the guard ignores that key. |
| `isObject`, `isAnswer`, `isPrefill` | Building blocks for the guards. |
| `isIntakeState` | Guard: the item id and status are strings, every answer is a primitive answer value, and every prefill has a primitive `value` and a known `source`. |
| `isSaved`, `isDone` | Guards for `{ saved: true }` and `{ item_status, request_status }`. |
| `getIntake()` | `GET /api/c/intake`. |
| `saveAnswer(questionId, value)` | `PUT /api/c/intake` with `{ question_id, value }`. |
| `finishIntake()` | `POST /api/c/intake/done`. |

Tests: `intake-api.test.ts`.
