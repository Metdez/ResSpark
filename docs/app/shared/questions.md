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
