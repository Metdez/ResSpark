# `app/worker/src/integrations/bank/provider.ts`

The bank contract (D-11, BANK-04). Types only: Plan 04 implements it for Plaid; Teller is Phase 8.

- `BankCapabilities`: `transactions`, `statementPdfs`, `hostedLink`. The UI decides what to show from these, never from the provider id.
- `PROVIDER_CAPABILITIES`: `plaid` = all three true; `teller` = transactions only (no statement PDFs, no hosted link); `truv` and `docuseal` = `null` (payroll and e-sign, not banks).
- `NormAccount`, `NormTransaction`: provider-neutral shapes that map one-to-one onto `bank_accounts` and `bank_transactions` columns (migration 0005).
- `NormBalance`: `{ external_account_id, current, available, as_of }` for one account. `current` and `available` are `null` when the provider gives none; `as_of` is an ISO timestamp. Stored on `bank_accounts.balance_*` (migration 0008).
- `SyncUpdateStatus`: `not_ready | initial | historical`, from Plaid's `transactions_update_status`.
- `BankProvider`: `id`, `capabilities`, and seven operations:
  - `createLinkSession(env, { connectionId, requestId, firmName, webhookUrl, returnUrl, statementsStart, statementsEnd })` → `{ linkRef, url, expiresAt }`;
  - `completeSession(env, { linkRef, publicTokens? })` → one `{ accessToken, externalId, institutionName }` per connected institution;
  - `syncTransactions(env, accessToken, cursor)` → added / modified / removed transactions, the next cursor, the update status (mapped `status` and Plaid's raw `statusRaw`) and accounts;
  - `listStatements(env, accessToken, { requestRefresh? })` → whether statements are supported and ready, with per-account statements by year and month;
  - `downloadStatement(env, accessToken, statementId)` → PDF bytes and an optional SHA-256;
  - `removeConnection(env, accessToken)` (BANK-06 retention);
  - optional `accountBalances(env, accessToken)` → one `NormBalance` per account (Plan 07-07, for `cash_and_bank_balances`). Optional so the Teller adapter can omit it; the bank reconcile skips the call when it is missing.
