# `app/worker/src/routes/admin-connections.ts`

Staff routes for Phase 4 connections (D-04, D-10, PAY-04, BANK-03, WEBH-02). It is mounted at `/api/admin` in `index.ts`, before the lookup route, so the lookup mount stays last.

`staffAuth` covers only this file's own paths (`/requests/:id/connections` and `/connections/*`), not `'*'`, so it never runs for sibling `/api/admin` routes. Every id in a path is untrusted. It must be a UUID (otherwise 400 `bad_request`) and is checked against `staff.firmId` in SQL before anything else happens. Another firm's id returns the same 404 `not_found` as a missing one (T-04-07).

| Route | Success | Errors |
|-------|---------|--------|
| `GET /requests/:id/connections` | 200 `{ connections: ConnectionSummary[] }`, newest first (`listRequestConnections`) | 400, 401, 404 `not_found` (`firmOwnsRequest` false) |
| `POST /connections/:id/refresh` | 200 `{ connection: ConnectionSummary }` (re-read after the reconcile) | 400, 401, 404, 502 `provider_unavailable`, 503 `provider_not_available`, 409 `provider_error` |
| `GET /connections/:id/transactions?months=3\|6` | 200 `{ months, total, transactions: TransactionRow[] }`. `months` defaults to 6. | 400 `bad_request` for any other `months`, 401, 404 |

## Parts

| Part | What it does |
|------|--------------|
| `UUID`, `fail`, `idParam` | Path-id check and `HTTPException` helpers. The app's `onError` turns them into the `{ error: { code, message } }` envelope. |
| `refreshError(c, e)` | Maps a reconcile failure. A transient `ProviderError` becomes 502 `provider_unavailable`. `NonRetryableError('bank_not_available')` becomes 503 `provider_not_available`; this is the Plan 01 stub until Plan 04 adds the Plaid branch. `NonRetryableError('connection_not_found')` becomes 404. Any other `ProviderError` becomes 409 `{ error: { code: 'provider_error', message: <vendor code> } }`, which carries the vendor's error code and never the vendor's response body. Anything else is rethrown and becomes a 500 `internal`. |
| Refresh handler | Loads the connection through `getFirmConnection`, then records `connection.refresh_requested` (`{ by: userId }`, actor = the staff user) so every click is audited (T-04-08). Then it runs `reconcileConnection(env, id, { source: 'staff', actorId })` inline, re-reads the row, and returns `getConnectionSummary`. Refresh never sets a status itself. The only status writer is the reconcile, through `connection_set_status`, so Refresh, cron, and webhooks all agree on the result. A `shortcut:` comment marks the upgrade path: if a Plaid statements fan-out ever outgrows the request budget, enqueue a `reconcile` job and return 202. |
| Transactions handler | Accepts only `3` or `6`. Calls `listConnectionTransactions(env, firmId, id, months, 1000)`. A `null` result (not this firm's connection) becomes 404. |

## Tests

`app/worker/src/routes/admin-connections.test.ts` (unit).
