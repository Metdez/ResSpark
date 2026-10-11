# `app/worker/test/payroll-start.test.ts`

Live tracer for Plan 04-03 Task 1 (PAY-01, BANK-05, D-16). Runs against the live Supabase project with the test firm `00000000-0000-0000-0000-00000000000e`; only the Truv API (`stubVendorFetch`) and the `ASSETS` binding are stubbed. Skips with a message when `SUPABASE_URL`, `SUPABASE_SECRET_KEY` or `CLIENT_LINK_HMAC_KEY` is missing.

Run: `pnpm -C app run test:live:file worker/test/payroll-start.test.ts`.

## Setup

- `seedConnectionFixture(env, { kind: 'payroll' })`: an opened request with one `payroll_connect` item and a live link.
- A real `rs_client` cookie from `GET /c/<minted token>` (302).
- Truv stubs: `POST /v1/orders/` and `GET /v1/orders/ord_fixture_new/` both answer `fixtures/truv/order_create_response.json` (`bridge_token: bt_fixture_1`).
- `env.JOBS.send` is a recorder; `TRUV_TEMPLATE_ID` is empty.

## Cases (in order; they share state)

1. Item view: Truv configured, `capabilities: null`, not consented, no connection.
2. Start without consent: 409 `consent_required`, no connection row, no vendor call.
3. Stale version: 409 `consent_text_stale`, no row. Current version twice: 200 both times, one `consents` row, one `consent.payroll_data` event.
4. Start: 200 with `bt_fixture_1`; the one `POST` carries the auth headers, `products: ['income']`, `external_user_id` and `order_number` = request id, `suppress_user_notifications: true`, the fixture case's names and no `template_id`; the row is `pending` with `external_id ord_fixture_new`; one `connection.started` event.
5. Second start: same `connection_id`, vendor calls `POST, GET`, still one row.
6. Item view: `consented: true`, `pending`, `employers: []`, and the JSON has no `external_id`, `bridge_token` or `created_at` key.
7. Reconcile: 202 `{ queued: true }`, one `{ type: 'reconcile', ref }` job; a random uuid is 404 and enqueues nothing.
8. `GET https://resspark.test/c/`: `content-security-policy` contains `cdn.truv.com` and `my.truv.com` (a non-localhost host, because `clientCsp` skips localhost).
9. `TRUV_CLIENT_ID: ''`: `configured: false`, start 503 `provider_not_configured`.

`afterAll` restores `fetch` and calls `fx.cleanup()` (connections, then the request, which cascades items, link, session and consents). Events stay (append-only, test firm only).
