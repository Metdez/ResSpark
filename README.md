# ResSpark

ResSpark helps a tax professional see which IRS collection path may fit a client. It is a screening tool. It does not file anything, and it does not replace CPA or EA review.

A case moves through four steps:

1. The taxpayer answers the intake questions in [`src/questions.py`](src/questions.py): household, housing, work, assets, and compliance.
2. Those answers decide which documents to request. IRS transcripts and three months of bank statements are always required. Pay stubs and a W-2, self-employment records, a mortgage or a lease, vehicle records, retirement, life insurance, investments, or bankruptcy papers are requested only when the answers call for them. A utility bill is optional for a homeowner or a renter.
3. [`src/document_parse.py`](src/document_parse.py) classifies each PDF from its text, then reads it. The category is one of `irs_transcripts`, `bank_statements`, `pay_stubs`, `self_employment`, `real_property`, `lease`, `housing_utilities`, `vehicle`, `retirement`, `insurance`, `investments`, or `bankruptcy`. The upload slot is not used. Health insurance and life insurance are both `insurance`. A file that matches none of those returns `{"file", "error"}`, and the other files are still read. The packets in [`examples/`](examples/) are the reference set.
4. When required facts are present, [`src/determination.py`](src/determination.py) compares income, allowable expenses, and equity with IRS standards and returns a suggested path. Unknown values block that step. A known zero does not.

The TypeScript app in [`src/frontend/`](src/frontend/) is the taxpayer question flow, the document upload screen, and a results screen. It asks 26 questions and leaves the tax balance and the collection deadline to the IRS transcript. State, county, household size, and pay frequency are chosen from lists. The browser keeps the answers and the selected files for that visit. The results screen is a sandbox fixture until a processor sends those files to the Python parser. Image files can be chosen on the upload screen; parsing still needs text in the PDF.

## Suggested paths

- **Compliance block.** Required returns are unfiled, or a bankruptcy is open.
- **Currently Not Collectible.** Allowable expenses use up monthly income, and realizable equity is not meaningful.
- **Simple payment plan** or **non-simple installment agreement.** Disposable income can pay the full balance by the collection deadline.
- **Manual review.** There is no disposable income but meaningful equity, or the balance cannot be full-paid from the numbers on hand.

Every result is a suggestion for professional review, not an IRS decision.

## Repository

- [`src/`](src/) — intake, case record, PDF parsing, determination, and standards access
- [`src/schemas/`](src/schemas/) — PostgreSQL schema and IRS standards seed data
- [`src/frontend/`](src/frontend/) — TypeScript questions, document upload, and sandbox results
- [`examples/`](examples/) — three synthetic client packets
- [`planning/`](planning/) — UI notes; previous READMEs are in [`planning/old/`](planning/old/)

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
