# `app/worker/src/webhooks/truv.test.ts`

Unit tests for `truvAdapter` in `webhooks/truv.ts` (worker-node project, no network). Run with `pnpm -C app exec vitest run --project worker-node worker/src/webhooks/truv.test.ts`.

## Setup

- `SECRET` stands in for the Truv Access Secret; `env` carries it as `TRUV_SECRET`.
- `raw` is the exact text of `test/fixtures/truv/order_status_updated.json`. The tests sign these bytes, not a re-serialized object.
- `signTruv(secret, body)` (`test/helpers/truv-sign.ts`) returns `v1=<hex HMAC-SHA256>`, the `X-WEBHOOK-SIGN` format.

## Cases

| Case | Proves |
|------|--------|
| Valid signature | Verifies, exposes `order_id` (`ord_fixture_1`), and keys the event by `webhook_id` (`wh_fixture_order_1`). |
| Another secret | A signature made with a different secret → `null`. |
| No `v1=` prefix | The bare hex digest is refused → `null`. |
| No `webhook_id` | A correctly signed body without `webhook_id` → `null`, so the ledger never gets an event without a key. |
| Exact bytes | A body signed with a trailing newline verifies only with that newline; the same body without it fails. The check runs on the raw body. |
| `configured` | True when `TRUV_SECRET` is set, false when it is empty. |
