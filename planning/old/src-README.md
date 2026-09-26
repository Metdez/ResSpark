# V5 Tax Resolution Screener

V5 is a simple tool for helping a tax professional see which IRS resolution
path may fit a client. It is a screening tool, not a filing system and not a
replacement for CPA/EA review.

## What it does

It looks at a client's income, monthly living costs, assets, IRS balance, and
time remaining for the IRS to collect. It then suggests one of these paths:

- Currently Not Collectible (CNC)
- Simple or non-simple Installment Agreement
- Compliance block or manual professional review

## How the client flow works

1. The chat asks a short set of taxpayer questions: household, location,
   income type, housing, vehicles, major assets, return filing, and bankruptcy.
2. Based on those answers, it asks for the right documents, such as pay stubs,
   bank statements, IRS transcripts, or mortgage statements.
3. Document information fills the case data. If something important is still
   missing, the chat asks only that follow-up question.
4. When the case data is complete, V5 returns a suggested screening path or
   sends the case to professional review.

## The important files

| File | What it is for |
|---|---|
| `questions.py` | The 28 client questions. |
| `financial_data.py` | The complete financial record used by the calculator. |
| `determination.py` | The IRS decision logic and calculations. |
| `standards.py` | Thin facade that sends standards requests to the database-backed repository. |
| `standards_repository.py` | Parameterized PostgreSQL lookups for all IRS standards. The caller supplies the connection. |
| `schemas/database_schema.sql` | PostgreSQL schema for case data and dynamic standards tables. |
| `schemas/lookup_standards.seed.sql` | Complete seed data for the dynamic standards tables. |
| `intake_workflow.py` | The chat intake rules: initial questions, document requests, missing-data checks, and handoff to the calculator. |
| `database_schema.sql` | The database design. One `case_financial_data` record is the official current data for each case. |
| `demo.py` | Three example cases you can run locally. |
| `tests/test_intake_workflow.py` | Tests that protect the main resolution paths. |

## Database in plain language

The database is the source of truth.

- `cases` holds one case per client situation.
- `case_financial_data` holds the current financial facts used by the logic.
- `question_definitions` lists the same 28 questions used in the chat.
- `documents` and `document_extractions` keep uploaded documents and what was
  found in them.
- `determination_runs` saves each suggested result.
- The standards tables hold every allowance, location mapping, state alias, and
  county suffix used by the calculator. Python retrieves these values at run
  time; it no longer reads standards CSVs or contains IRS standard amounts.

An empty database value means the information is still unknown. A stored `0`
means it was checked and is really zero. The calculator does not run on missing
required data.

## Run it

From the project folder:

```bash
cd V5
psql "$DATABASE_URL" -f schemas/database_schema.sql
psql "$DATABASE_URL" -f schemas/lookup_standards.seed.sql
pip install "psycopg[binary]"
python demo.py
cd ..
python -m unittest discover -s V5/tests -v
```

The database schema is written for PostgreSQL 14 or newer. Set `DATABASE_URL`
before running the demo or evaluating a complete case. Create a database
connection in the caller and pass `PostgresStandardsRepository(connection)` to
`determine_resolution_path(...)` or `evaluate_case(...)`.
