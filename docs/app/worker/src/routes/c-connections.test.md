# `app/worker/src/routes/c-connections.test.ts`

Unit tests for the client connection routes (no network). `db/cases`, `db/connections`, `db/connections-ops`, `db/consents`, `db/documents`, `db/events` and `integrations/truv/start` are auto-mocked; `clientSession` is replaced by a middleware that sets a fixed session (link `L1`, request `R1`, firm `F1`); `requireClientHeader` stays real. `beforeEach` resets mocks and the in-memory rate limiter, and sets defaults: a pending `payroll_connect` item on `R1`, consent present, case `C1`, no connection. `env.JOBS.send` is a `vi.fn()`.

| Case | Expected |
|------|----------|
| item view on an `upload` item | 409 `item_not_connect`, `cache-control: no-store` |
| item view on a `bank_connect` item, `BANK_PROVIDER: plaid`, no Plaid secrets | `configured: false`, Plaid capabilities, `connection: null` |
| item view on another request's item | 404 |
| consent without `X-Requested-With` | 403 `bad_origin`, `no-store` |
| consent with `kind: 'nope'` | 400, nothing recorded |
| bank start with consent and Plaid configured | 503 `provider_not_available` (Plan 04 flips this) |
| payroll start on a bank item | 409 `item_kind_mismatch` |
| payroll start on an approved item | 409 `item_approved`, `startPayroll` not called |
| `startPayroll` rejects `ProviderError(..., 'invalid_phone')` | 502 `provider_error`, message `invalid_phone` |
| `startPayroll` resolves `reused: true` | 200 with the normal body |
| start without `item_id` / with kind `teller` | 400 / 404 |
| 11 reconciles in a minute | ten 202, then 429 `rate_limited`; `JOBS.send` called 10 times with `{ type: 'reconcile', ref }` |
| reconcile of another request's connection | 404, `no-store`, nothing sent |
