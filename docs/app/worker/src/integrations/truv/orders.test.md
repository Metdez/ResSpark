# `app/worker/src/integrations/truv/orders.test.ts`

Unit tests for `orders.ts` (worker-node project, no network). Run with `pnpm -C app exec vitest run --project worker-node worker/src/integrations/truv/orders.test.ts`.

## Helper

`order(statuses, over)` builds a `TruvOrder` (`ord_1`, not expired) with one employer per status: `emp_<n>`, `link_<n>`, company `Co <n>`. `over` replaces any field, for example `is_expired`.

## Cases

| Group | Proves |
|-------|--------|
| `mapOrderStatus` (PAY-04) | The order-level status from the employer statuses: all `completed` → `done`; some still open → `connected`; only `pending`/`sent` → `pending`; only `error` → `error` with `employer_error`; an error next to a completed employer → `done`; `completed` + `skipped` → `done`; `full_parse` → `connected`; only `skipped` → `error` with `all_skipped`; no employers → `pending`. An expired order with work outstanding → `error` with `order_expired`; an expired order whose employers all completed stays `done`. |
| `mapEmployerStatus` | Each Truv employer status maps to the step's four: `pending`/`sent` → `pending`; `completed`/`skipped` → `done`; `error`/`expired`/`canceled`/`no_data` → `error`; `full_parse` → `connected`. |
| `summarizeEmployers` | An employer already in the previous summary keeps `fetched_at` and its counts and takes the new status; a new employer is appended with only its ids, name and status. |
| `isTruvOrder` | Accepts a well-formed order; rejects a body without `employers`, an employer with a non-string id, and `null`. |
| `phone10` | `+15550100003` → `5550100003`; a non-US number and `null` → `null`. |
| `createOrder` | `stubVendorFetch` answers `POST prod.truv.com/v1/orders/` with 201. With `templateId`, `email` and `phone10` all `null`, the body has none of `template_id`, `email` or `phone`, and still asks for `products: ['income']` with user notifications suppressed. With them set, the body carries `template_id`, `email` and `phone`. |

`afterEach` restores `fetch` when a `createOrder` case stubbed it.
