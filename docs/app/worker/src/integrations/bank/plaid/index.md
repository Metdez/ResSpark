# app/worker/src/integrations/bank/plaid/index.ts

`plaidProvider`: the Plaid implementation of `BankProvider` (D-11, BANK-04).

| Field | Source |
|-------|--------|
| `id` | `'plaid'` |
| `capabilities` | `PROVIDER_CAPABILITIES.plaid` (`transactions`, `statementPdfs`, `hostedLink` all true). |
| `createLinkSession`, `completeSession` | `plaid/link.ts` |
| `syncTransactions` | `plaid/transactions.ts` |
| `listStatements`, `downloadStatement` | `plaid/statements.ts` |
| `accountBalances` | `getAccountBalances` from `plaid/accounts.ts` (`/accounts/get`). |
| `removeConnection(env, accessToken)` | POSTs `/item/remove` so Plaid stops billing the Item (D-13). |
