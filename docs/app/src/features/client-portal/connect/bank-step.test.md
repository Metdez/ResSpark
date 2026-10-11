# `app/src/features/client-portal/connect/bank-step.test.tsx`

Renders `BankStep` (step `I2`, firm `ValorTax`) with `./connection-api`, `@/features/uploads/api` (`listItemDocuments`), and `sonner` mocked, and `UploadSheet` replaced by a stub showing the item id and a `close upload` button that calls `onClose`. `window.location` is stubbed so `assign` is a spy. `conn(over, caps)` builds an `ItemConnection` with all capabilities on; `view()` builds a connection; `ACCOUNT` has six months in shuffled order (mask `0000`).

## States

1. Fresh with every capability: the intro, a 44 px `Connect bank`, and the upload button.
2. Connect → the bank consent (title and "We never see your bank password.") → `I agree` → `recordConsent('bank_data')`, `startConnection('bank', 'I2')`, and `location.assign` with the hosted link URL.
3. Not configured: the not-configured copy, no connect button, and the upload button first.
4. `statementPdfs: false`: the transactions-only intro.
5. `hostedLink: false`: the not-available copy and no connect button.
6. `pending`: "Checking your connection…".
7. `syncing` and `connected`: the history copy.
8. `error` with `ITEM_LOGIN_REQUIRED`: the sign-in copy and `Connect bank` again.
9. `done`: the done copy.
10. `refetchInterval` is 5 000 for `syncing` and `false` for `done`.
11. `provider_not_configured` from start shows the not-configured copy and never navigates.

## Statement months

12. Six rows newest first (`Sep 2026` … `Apr 2026`), each at least 44 px; `Received` for available and manual, `Checking…` for pending, "Not from this bank" for not_supported, and 44 px upload buttons for Jun and May with `••0000`.
13. The Jun upload: on close, of two ready documents only the one uploaded after the sheet opened is attributed, once, as `{ document_id: 'D1', bank_account_id: 'A1', year: 2026, month: 6 }`, and the connection is refetched.
14. A 409 `month_available` from attribution is swallowed (no toast).
15. `Upload statements instead` never lists documents or attributes.
