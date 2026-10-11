# `app/worker/src/routes/c-connections.test.ts`

Unit tests for the client connection routes (no network). `db/cases`, `db/connections`, `db/connections-ops`, `db/consents`, `db/documents`, `db/events` and `integrations/truv/start` are auto-mocked; `clientSession` is replaced by a middleware that sets a fixed session (link `L1`, request `R1`, firm `F1`); `requireClientHeader` stays real. `beforeEach` resets mocks and the in-memory rate limiter, and sets defaults: a pending `payroll_connect` item on `R1`, consent present, case `C1`, no connection. `env.JOBS.send` is a `vi.fn()`.

| Case | Expected |
|------|----------|
| item view on an `upload` item | 409 `item_not_connect`, `cache-control: no-store` |
| item view on a `bank_connect` item, `BANK_PROVIDER: plaid`, no Plaid secrets | `configured: false`, Plaid capabilities, `connection: null` |
| item view on another request's item | 404 |
| consent without `X-Requested-With` | 403 `bad_origin`, `no-store` |
| consent with `kind: 'nope'` | 400, nothing recorded |
| consent `esign` / `esign-v1` (Plan 06-02) | 200, `recordConsent` called with `kind: 'esign'` |
| consent `esign` with version `old` | 409 `consent_text_stale` |
| consent with the item kind `signature` | 400 |
| bank start with consent and Plaid configured | 200 `{ connection_id, kind: 'bank', provider: 'plaid', capabilities, hosted_link_url }` from the mocked `startBank`, called with `origin: 'http://localhost'` (Plan 04-04) |
| payroll start on a bank item | 409 `item_kind_mismatch` |
| payroll start on an approved item | 409 `item_approved`, `startPayroll` not called |
| `startPayroll` rejects `ProviderError(..., 'invalid_phone')` | 502 `provider_error`, message `invalid_phone` |
| `startPayroll` resolves `reused: true` | 200 with the normal body |
| start without `item_id` / with kind `teller` | 400 / 404 |
| 11 reconciles in a minute | ten 202, then 429 `rate_limited`; `JOBS.send` called 10 times with `{ type: 'reconcile', ref }` |
| reconcile of another request's connection | 404, `no-store`, nothing sent |
| manual: ready upload, in-window month | 200 `{ status: 'manual' }`, `setMonthCell(acc, y, m, 'manual', doc)`, event `statement.manual_attributed` |
| manual: month outside the window | 400, no cell write |
| manual: cell `available` | 409 `month_available` |
| manual: document `uploading` | 409 `document_not_ready` |
| manual: document of another request or item; account not on the connection | 404 |
| manual: cell already `manual` | 200, the new document id replaces the old one |
