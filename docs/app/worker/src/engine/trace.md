# `app/worker/src/engine/trace.ts`

The calculation-trace helpers from `src/determination.py`, ported 1:1: `_INCOME_LINES`, `_step`, `_check` and `_trace`. A trace is the "show your work" record that the staff view can render beside a determination. Its labels, formulas and descriptions are Python's wording, verbatim, and `parity.test.ts` compares every trace with `golden.json`.

## Parts

| Part | Python source | What it does |
|------|---------------|--------------|
| `TraceStep` | `_step` / `_check` dict shape | `label`, `formula`, `inputs` (`{label, value}` pairs), `inputKeys` (the `FinancialData` columns the step reads), `result` (a number, or text for a check), `format` (`'currency'` or `'text'`), and an optional `status`. |
| `TraceSection` | the `_trace` section dicts | `id`, `title`, `description`, `steps`. |
| `INCOME_LINES` | `_INCOME_LINES` (:226-238) | The 11 Box D income lines as `[label, key]`, in Python's order. |
| `step(label, formula, result, inputs, inputKeys = [], format = 'currency', status?)` | `_step` (:241-252) | Builds a step from `[name, value]` input pairs. `status` is set only when it is truthy, as in Python. |
| `title(status)` | `status.replace("_", " ").title()` | Turns a check status into its display text (`not_evaluated` → `Not Evaluated`). |
| `check(label, detail, status)` | `_check` (:255-264) | A decision-check step: the detail goes in `formula`, there are no inputs, `result` is the titled status and `format` is `'text'`. |
| `buildTrace(fd, grossIncome, expenses, rawNdi, displayedNdi, nre, expenseSteps, equitySteps, checks)` | `_trace` (:267-296) | Returns the five sections `income`, `expenses`, `disposable`, `equity` and `decision`. `income` has one step per income line plus the total, whose input keys are all 11 lines. `expenses` and `equity` get their total steps appended; the caller passes copies, as Python does. In `disposable`, the formula gains "; negative amounts are treated as $0 for path selection" when the displayed NDI differs from the raw NDI. `resolution-path.ts` inserts the sixth section, `resolution_amounts`, at index 4. |

## Rules

- The text is recommendation wording. Change it in Python first and regenerate `golden.json`.
- `trace.ts` imports only the `FinancialData` type, so it stays pure.
