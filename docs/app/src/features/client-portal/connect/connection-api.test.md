# `app/src/features/client-portal/connect/connection-api.test.ts`

Unit tests for `connection-api.ts` with `fetch` stubbed through `vi.stubGlobal`. Helpers: `stub(status, body)` answers every call with that status and JSON body; `call(f)` reads the first call's path and init; `header(init)` reads `X-Requested-With`. `afterEach` restores the globals.

1. `getItemConnection('I1')` GETs `/api/c/items/I1/connection` with `credentials: 'same-origin'` and returns the body.
2. A body without a valid `provider`/`consented` rejects with code `invalid_response`.
3. `recordConsent('payroll_data')` POSTs `/api/c/consents` with the kind and `CONSENT_TEXT.payroll_data.version`, and sends the `ResSpark` header.
4. `startConnection('payroll', 'I1')` POSTs `{ item_id: 'I1' }` to `/api/c/connections/payroll/start`.
5. A 503 `provider_not_configured` rejects with a `PortalError` carrying that status and code.
6. `reconcileConnection('C1')` POSTs `/api/c/connections/C1/reconcile`, and resolves when `fetch` itself rejects.
7. `attributeStatement` POSTs its body to `/api/c/connections/C1/statements/manual`.
