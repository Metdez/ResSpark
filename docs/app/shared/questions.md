# `app/shared/questions.ts`

The 28 intake question declarations, shared by the Worker engine and (from Plan 07-08) the SPA client-intake step. Copied verbatim from `src/questions.py`, with the question helpers from `src/intake_workflow.py`. Wired into both TypeScript projects: `app/worker/tsconfig.json` includes `../shared/**/*.ts` and `app/tsconfig.app.json` includes `shared`.

## Parts

| Part | Python source | What it does |
|------|---------------|--------------|
| `QuestionType` | the Python `type` objects | `'bool' \| 'int' \| 'float' \| 'str'` — the Python type names, so the exporter can emit `type.__name__` and the parity test compares them directly. |
| `Question` | question dict | `id`, `prompt`, `type`. |
| `QUESTIONS` | `QUESTIONS` | The 28 declarations, in order, prompts byte-identical (section comments kept). Changing one is an intake-version change and must change Python first. |
| `QUESTION_BY_ID` | `QUESTION_BY_ID` | Lookup by id. |
| `INITIAL_QUESTION_IDS` | `INITIAL_QUESTION_IDS` | The 18 ids asked first, in order. |
| `isApplicable(id, row)` | `_is_applicable` | `filing_joint_offer` and `age_spouse` apply only when `filing_status_married === true`; `rents_home` only when `owns_home === false`; everything else always applies. Strict equality mirrors Python's `is True`/`is False`. |
| `pythonTypeName(value)` | `type(value).__name__` | Names a value the way Python would for JSON-representable values: `NoneType`, `bool`, `int` (integral number), `float`, `str`, `list`, `dict`. |
| `VALID` | the `valid` expression in `validate_answer` | Per type: `bool` only a boolean; `int` an integral number (a boolean is not an int); `float` any finite number (Python accepts `int` or `float`, never `bool`); `str` a string. |
| `validateAnswer(id, value)` | `validate_answer` | Throws `TypeError("<id> requires <type>; got <actual>")` with Python's message, or `Error("Unknown question: <id>")` (Python raises `KeyError`). |

## Known limit

JSON cannot tell `3.0` from `3`, so `validateAnswer('household_size', 3.0)` passes here while Python rejects it. The fixtures avoid such inputs (RESEARCH Pitfall 3).

## Tests

`app/worker/src/engine/parity.test.ts` checks the ids, prompts and types against `golden.json.questions` and every `validations` sample against Python's accept/reject and message.

## Client intake additions (Plan 07-08, D-13)

These parts drive the phone intake step (`app/src/features/client-portal/intake/`) and its Worker route (`app/worker/src/routes/c-intake.ts`). No prompt, type or id changes.

| Part | What it does |
|------|--------------|
| `QuestionControlKind` | `'yes_no' \| 'stepper' \| 'number' \| 'choice'`: how the phone asks a question. |
| `QuestionUi` | `section` (heading shown under the progress line), `control`, optional `options` (value + label), `minimum`, `maximum`, `helpText`. |
| `yesNo`, `count`, `age` | Small builders for the table below: every bool is `yes_no`; household size, dependents and vehicles are steppers (household size from 1, the others from 0, all up to 50); both ages are a numeric input from 0 to 120. |
| `QUESTION_UI` | One entry per **client** question (23). Sections and the four pay-frequency labels (`Weekly`, `Every two weeks`, `Twice a month`, `Monthly`) come from the frozen `src/frontend/src/questions.ts`. `state_of_residence` and `county_of_residence` have no entry (the address step covers them), nor do the transcript facts `total_tax_owed`, `tax_only_balance`, `csed_months_remaining` (staff enter or accept those). |
| `isClientQuestion(id)` | Own-property check on `QUESTION_UI`, so an untrusted id such as `toString` or `__proto__` is never treated as a question. |
| `CLIENT_QUESTION_IDS` | The 23 client ids in `QUESTIONS` order. |
| `PREFILL_COLUMNS` | `is_wage_earner`, `pay_frequency`, `filing_status_married`, `age_taxpayer`: the only columns the phone may prefill, and only from A-reliability Truv or Logics proposals. |
| `clientQuestionOrder(answers)` | The client initial ids (the 16 of `INITIAL_QUESTION_IDS` that are client questions) first, then the other client ids in `QUESTIONS` order, filtered by `isApplicable` and one portal-only rule: `pay_frequency` is skipped when `is_wage_earner === false` (staff mark that line "Not applicable", open question 2). With no answers it returns 20 ids; married adds `filing_joint_offer` (right after marital status) and `age_spouse` (right after `age_taxpayer`); owning a home removes `rents_home`. |
| `validateClientAnswer(id, value)` | `unknown_question` for anything outside `QUESTION_UI`; `bad_value` when `validateAnswer` throws, when a number is outside `minimum`/`maximum`, or when a choice is not one of its option values; otherwise `null`. The Worker uses it at the trust boundary and the phone uses it before saving. |

Tests: `app/shared/questions.test.ts` (project `web`; `app/vitest.config.ts` includes `shared/**/*.test.ts`). The live contract test in `app/worker/test/intake-live.test.ts` compares `QUESTIONS` with the 28 `question_definitions` rows.
