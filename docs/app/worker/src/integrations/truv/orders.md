# `app/worker/src/integrations/truv/orders.ts`

Truv order types, the reconcile read, and the deterministic order → connection status mapping (PAY-04).

## Types

- `TruvEmployerStatus`: the documented employer statuses (`pending, sent, completed, error, canceled, expired, no_data, skipped`). `TruvEmployer.status` also accepts any string, because Truv adds statuses.
- `TruvEmployer`: `id`, `status`, `link_id`, optional `product_type`, `data_source`, `company.name`.
- `TruvOrder`: `id`, optional `bridge_token`, `is_expired`, `expired_at`, and `employers[]`.
- `EmployerSummary`: what is stored in `connections.data.employers[]`: `employer_id`, `link_id`, `company_name`, mapped `status`, and the fetch bookkeeping Plan 03 fills (`fetched_at`, `pay_stubs`, `w2s`, `income_reports`).

## Functions

- `isTruvOrder(v)`: boundary type guard (string `id`, array of employers each with string `id` and `status`).
- `getOrder(env, orderId)`: `GET /v1/orders/{id}/` through `truvFetch` with the guard.
- `mapEmployerStatus(s)`: `pending|sent` → `pending`; `completed|skipped` → `done`; `error|expired|canceled|no_data` → `error`; anything else (`full_parse`, `login`, `mfa`…) → `connected` (in progress).
- `mapOrderStatus(order)`, checked in order:

| Condition | Result |
|-----------|--------|
| every employer `completed` or `skipped`, at least one `completed` | `done` |
| `is_expired: true` | `error`, code `order_expired` |
| no employers yet (open order) | `pending` |
| any employer `pending`/`sent` | `connected` if one completed, else `pending` |
| any employer in an unknown status | `connected` |
| at least one completed, the rest failed | `done` |
| nothing completed | `error`, code `employer_<status>` (or `all_skipped`) |

  Completion is checked before expiry so an order whose employers all finished stays `done`.
- `summarizeEmployers(order, previous)`: one summary per order employer, keyed by `employer_id`; fields from the previous summary (`fetched_at`, counts, a known `link_id`/`company_name`) survive; new employers are added.

## Tests

`orders.test.ts`: the `mapOrderStatus` table (all completed, completed + pending, all pending, error only, error + completed, completed + skipped, unknown `full_parse`, all skipped, no employers), `is_expired` with outstanding work (`order_expired`) and with every employer completed (`done`), every `mapEmployerStatus` value including `skipped`, `summarizeEmployers` keeping `fetched_at`/`pay_stubs` and adding a new employer, and the `isTruvOrder` guard.
