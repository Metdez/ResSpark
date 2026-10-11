# `app/worker/src/engine/financial-data.ts`

The canonical fact shape of a case, ported from `src/financial_data.py`, plus the two row helpers from `src/intake_workflow.py` that turn a `case_financial_data` row into it.

Field names stay **snake_case** so a database row, a `golden.json` row, Python and TypeScript all share one shape.

## Parts

| Part | Python source | What it does |
|------|---------------|--------------|
| `CaseRow` | `Mapping[str, object]` | A read-only record of column name → value, as read from `case_financial_data` (or a fixture). Values are `unknown` until converted. |
| `FinancialData` | `@dataclass FinancialData` | Every field, in the dataclass order and grouped like the Python comments: household/profile, Box D income (433-A(OIC) lines 30-38), Box E actual expenses (lines 40-51), Section 3 assets (lines 1-7, including the per-vehicle lists), Section 9 gates, liability, and `ai_flags`. Money is plain `number` (D-02: no Decimal, no cents). `tax_only_balance` and `oic_payment_months` are `number \| null` as in Python. |
| `FINANCIAL_DATA_FIELDS` | `FinancialData.__dataclass_fields__` | The field names in dataclass order; `financialDataFromCaseRow` iterates it. |
| `REQUIRED_FINANCIAL_COLUMNS` | `REQUIRED_FINANCIAL_COLUMNS` | All fields minus `ai_flags`, `oic_payment_months`, `tax_only_balance`, sorted (Python keeps a set; every consumer sorts it). |
| `MissingFactError` | the `ValueError` raised by `financial_data_from_case_row` | Carries `columns` (the missing names) and the Python message `Cannot build FinancialData; missing: a, b`. |
| `missingFinancialColumns(row)` | `missing_financial_columns` | Required columns whose value is `None` in Python, ported as `== null` so both `null` and an absent key count as unknown. A known `0`/`false` is present. Returned sorted. Re-exported by `intake-workflow.ts`, where Python defines it. |
| `financialDataFromCaseRow(row)` | `financial_data_from_case_row` | Throws `MissingFactError` when a required fact is unknown (unknown never defaults, CLAUDE.md). Otherwise copies every field: `ai_flags` becomes `row.ai_flags \|\| []` (Python `or []`), and an absent optional column becomes `null` (Python `dict.get` → `None`). |

## Shortcut

Python passes each value through `_database_value`, which turns a PostgreSQL `Decimal` into `float`. supabase-js already returns numbers, so the TS port copies values as stored. The `shortcut:` comment in the code names the upgrade trigger: add coercion if a caller ever passes numeric strings.

## Tests

`parity.test.ts` runs every golden row through `evaluateCase`, which calls these helpers; the `null_<column>` cases prove that each required column blocks evaluation.
