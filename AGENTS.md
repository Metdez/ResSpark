# ResSpark contributor guide

## Conections
Use type script for all front end be typescript

## Project purpose

ResSpark is a **tax-resolution screening tool**. It helps a tax professional
identify a possible IRS resolution path; it does not make a filing decision or
replace CPA/EA review. Treat all calculation and eligibility changes as
high-risk, domain-sensitive work.

## Repository layout

- `src/financial_data.py` — canonical `FinancialData` dataclass.
- `src/questions.py` — the 32 intake-question definitions.
- `src/intake_workflow.py` — question ordering, document requests,
  missing-data checks, and calculator handoff.
- `src/determination.py` — deterministic IRS screening calculations and path
  selection. Keep this free of LLM or heuristic judgment.
- `src/standards.py` and `src/standards_repository.py` — lookup facade and
  parameterized PostgreSQL access for IRS standards.
- `src/schemas/` — database schema and standards seed data.
- `src/tests/` — `unittest` coverage. Tests use a fake standards repository
  and must not require a live database.
- `Context/` — source reference documents. Do not modify these unless the task
  explicitly updates reference material.
- `Examples/` — synthetic client-document packets. Do not treat them as a
  source of production data.

## Local commands

Run commands from the repository root:

```powershell
python -m unittest discover -s src/tests -v
python src/demo.py
```

The demo needs a PostgreSQL connection and `DATABASE_URL` when it performs
standards lookups. Apply database changes in this order:

```powershell
psql "$env:DATABASE_URL" -f src/schemas/database_schema.sql
psql "$env:DATABASE_URL" -f src/schemas/lookup_standards.seed.sql
```

## Implementation rules

- Preserve the separation of concerns: intake gathers and validates facts;
  `FinancialData` represents facts; the determination module calculates;
  standards come from the repository/database.
- Keep `case_financial_data` as the canonical case-data source. Distinguish
  `NULL` (unknown) from `0` (known to be zero); unknown required values must
  block evaluation rather than silently using a default.
- Keep standards data out of Python business logic. Add or update dynamic
  standards in the SQL schema/seed data and retrieve them through the
  repository interface using parameterized queries.
- Do not change IRS thresholds, formulas, asset reductions, eligibility gates,
  or recommendation wording without an authoritative source and targeted tests.
  Explain the source and rule in code comments or the change description.
- Preserve the 32-question contract in `questions.py` unless a deliberate
  intake-version change is requested. Update workflow and tests together when
  changing question applicability or document-request logic.
- Prefer standard-library Python and maintain the existing type hints,
  dataclasses, and `unittest` style. Avoid adding runtime dependencies unless
  the task explicitly requires one.

## Testing expectations

- Add or update a focused test for every behavior change.
- For calculation changes, cover normal, boundary, and missing-data cases.
- For schema/repository changes, verify query parameters and interface usage;
  do not make the unit suite depend on local PostgreSQL.
- Run the full test command above before handing off work. If a database-backed
  demo cannot run, state that explicitly.

## Data and safety

- Never commit real taxpayer information, credentials, connection strings, or
  document extractions containing personal data.
- Keep generated artifacts, virtual environments, and local databases out of
  version control.
- Present outputs as suggested paths for professional review, never as a
  guaranteed IRS outcome or legal/tax advice.
