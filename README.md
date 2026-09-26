# ResSpark

ResSpark helps a tax professional see which IRS collection path may fit a client. It is a screening tool. It does not file anything, and it does not replace CPA or EA review.

A case moves through four steps:

1. The taxpayer answers the intake questions in [`src/questions.py`](src/questions.py): household, housing, work, assets, and compliance.
2. Those answers decide which documents to request: IRS transcripts and bank statements, plus pay stubs, a lease or mortgage statement, auto-loan statements, or a health-insurance statement when they apply.
3. [`src/document_parse.py`](src/document_parse.py) reads those PDFs into the case record. The packets in [`Examples/`](Examples/) are the reference set. The same document types are also accepted under ordinary titles, such as "Pay Stub" or "Lease Statement".
4. When required facts are present, [`src/determination.py`](src/determination.py) compares income, allowable expenses, and equity with IRS standards and returns a suggested path. Unknown values block that step. A known zero does not.

The TypeScript intake in [`src/frontend/`](src/frontend/) is the taxpayer question flow. Document upload belongs on that screen; parsing stays in Python.

## Suggested paths

- **Compliance block.** Required returns are unfiled, or a bankruptcy is open.
- **Currently Not Collectible.** Allowable expenses use up monthly income, and realizable equity is not meaningful.
- **Simple payment plan** or **non-simple installment agreement.** Disposable income can pay the full balance by the collection deadline.
- **Manual review.** There is no disposable income but meaningful equity, or the balance cannot be full-paid from the numbers on hand.

Every result is a suggestion for professional review, not an IRS decision.

## Repository

- [`src/`](src/) — intake, case record, PDF parsing, determination, and standards access
- [`src/schemas/`](src/schemas/) — PostgreSQL schema and IRS standards seed data
- [`src/frontend/`](src/frontend/) — TypeScript question flow
- [`Examples/`](Examples/) — three synthetic client packets
- [`Context/`](Context/) — IRS reference documents
- [`Planning/`](Planning/) — UI notes; previous READMEs are in [`Planning/old/`](Planning/old/)

Standards amounts live in the database. Python looks them up through [`src/standards_repository.py`](src/standards_repository.py).

## Run

From the repository root:

```bash
python -m unittest discover -s src/tests -v
```

The demo needs PostgreSQL 14 or newer, `DATABASE_URL`, and `psycopg`. Apply the schema, then the standards seed:

```bash
psql "$DATABASE_URL" -f src/schemas/database_schema.sql
psql "$DATABASE_URL" -f src/schemas/lookup_standards.seed.sql
python src/demo.py
```

Frontend tests:

```bash
cd src/frontend
npm install
npm test
```
