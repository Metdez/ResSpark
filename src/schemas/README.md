# V5 database schemas and dynamic standards data

Apply `database_schema.sql` first, then `lookup_standards.seed.sql`. Together
they create and populate the PostgreSQL tables used by the Python standards
repository.

`lookup_standards.seed.sql` contains every county-housing, MSA-county, and
state-region source value, plus the national, health-care, and transportation
amounts that previously lived in Python. Its header records the SHA-256 hash of
each CSV source used to generate it.
