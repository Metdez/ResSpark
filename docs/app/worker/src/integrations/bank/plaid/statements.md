# app/worker/src/integrations/bank/plaid/statements.ts

`listStatements` and `downloadStatement` for Plaid Statements.

Current state: placeholders that throw `NonRetryableError('not_implemented')`, marked with a `shortcut:` comment. Plan 04-04 Task 2 fills them (`/statements/list`, `/statements/download` with the `Plaid-Content-Hash` check, `/statements/refresh`, `PRODUCTS_NOT_SUPPORTED` and `PRODUCT_NOT_READY` mapping). They exist now so `plaidProvider` type-checks. The bank reconcile does not call them yet.
