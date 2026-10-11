# `app/worker/test/connections-tracer.test.ts`

The Phase 4 tracer, live against the Supabase project with only the Truv API stubbed. Runs in `pnpm -C app test:live`; skips (with a printed reason) when `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing.

## Setup

- `env`: process env plus `TRUV_CLIENT_ID: 'test-client'`, a random `TRUV_SECRET`, and a `JOBS.send` that records jobs into an array (the Vitest config clears `vi.fn()` history between tests, so a plain recorder keeps the sent job across tests).
- `beforeAll`: points `defaultFirmId` at the test firm, seeds a payroll fixture, removes crash leftovers (fixture webhooks, any connection with order `ord_fixture_1`), inserts a `pending` Truv connection with `external_id: 'ord_fixture_1'`, serializes `truv/order_status_updated.json` once (with `order_number` = the request id), and stubs `GET https://prod.truv.com/v1/orders/ord_fixture_1/` with `truv/order_two_employers.json`.
- `afterAll`: restores fetch and the firm override, deletes fixture webhooks, runs the fixture cleanup.

## Tests

1. Signed POST → 200 `{ ok: true }` under one second (the elapsed ms is printed), exactly one job `{ type: 'webhook', provider: 'truv', ref: <uuid> }`, one `webhook_events` row `queued`, no vendor call.
2. The identical bytes again → 200 `{ ok: true, duplicate: true }`, still one job and one row.
3. `queue()` with the recorded job → `ack` once, no `retry`; exactly one stubbed `GET` carrying `X-Access-Client-Id` and `X-Access-Secret`; connection `done` with `completed_at` and `last_webhook_at`, employers `Acme Inc` and `Beta LLC` both `done`; a second job `{ type: 'financials_propose', ref: <case id>, reason: 'connection_done' }` (Plan 07-07); item `submitted`; request `waiting_on_staff`; one `connection.done` event whose payload has `connection_id` and no `access_token`, `bridge_token`, `webhook_sign`; ledger row `done` with `processed_at`.
4. A body signed with the wrong secret → 401 `invalid_signature`, no ledger row, exactly one `webhook.rejected` event with `actor_id 'truv'` for the test firm since the suite started (filtered by actor so a parallel DocuSeal rejection in `esign-complete.test.ts` does not count), payload exactly `{ provider: 'truv' }`, no new job (still the two from tests 1 and 3).

Since Plan 04-03 the payroll reconcile also reads each completed employer income report and document list. The tracer stubs both with empty bodies (`{ employments: [] }` and `[]`) so it stays a status test, and counts only the `GET /v1/orders/` calls.
