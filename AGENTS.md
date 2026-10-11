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


## Coding
Use the pony tail skill while coding and create a markdown file for every new file you create explaining it in detail and save them in the docs folder. Make sure no file goes over 500 lines of code and then try to break stuff into separate files so it's well organized. Write code in an Modular way.

## UI/UX/Components 

Use these Repos for inspiration on front-end design and everything. I want you to use their components and use their design whenever you're doing anything.

https://github.com/frappe/erpnext.git
- ERPNext: open-source ERP (accounting, invoicing, HR, CRM) built on the Frappe framework. Use it as a reference for data-heavy business UI: forms, list/table views, dashboards, sidebar navigation, and status badges.

https://github.com/docusealco/docuseal.git
- DocuSeal: open-source document signing and form-filling platform. Use it as a reference for document upload, document/form builder, e-signature flows, and clean submission/status screens (relevant to our client-document intake).

https://github.com/bigcapitalhq/bigcapital.git
- Bigcapital: open-source accounting and bookkeeping software (invoices, bills, expenses, financial reports). Use it as a reference for financial UI: transaction tables, financial statements/reports, and money-formatted fields.

## Before doing anything

Web search using Firecrawl and try to find GitHub repos that have the most stars and that could have done the same thing or could be useful when it comes to references or using code from 


