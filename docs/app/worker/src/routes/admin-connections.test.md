# `app/worker/src/routes/admin-connections.test.ts`

Unit tests for `admin-connections.ts`, driven through `app.request()` with no network calls.

Mocks:

- `db/connections-ops` (`firmOwnsRequest`, `getConnectionSummary`, `getFirmConnection`, `listConnectionTransactions`, `listRequestConnections`)
- `db/connections` (`getConnection`, `recordConnectionEvent`)
- `jobs/reconcile`

`staffAuth` is wrapped. When a request carries the `x-test-staff` header, the wrapper sets a fixed staff user `{ userId: 'U1', firmId: 'F1' }`. Without the header, the real middleware runs, which is how the 401 case is tested.

| Group | Proves |
|-------|--------|
| list | 200 in the order the read model returns, called with `('F1', id)`; another firm's request returns 404 and nothing is listed; a malformed id returns 400; no bearer token returns 401. |
| refresh | The `connection.refresh_requested` event is recorded once, before `reconcileConnection(…, { source: 'staff', actorId: 'U1' })`, and the response is the summary. Another firm's connection returns 404 with no event and no reconcile. A transient `ProviderError` returns 502 `provider_unavailable`. `bank_not_available` returns 503 `provider_not_available`. A permanent `ProviderError` returns 409 `{ code: 'provider_error', message: 'bad_response' }`, and the vendor text is not echoed. |
| transactions | `?months=3` calls `listConnectionTransactions('F1', id, 3, 1000)`. A missing `months` defaults to 6. `months=12` returns 400 `bad_request`. A `null` result returns 404. |
