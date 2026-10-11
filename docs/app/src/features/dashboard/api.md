# `app/src/features/dashboard/api.ts`

The dashboard's client for `GET /api/admin/requests?status=&q=` (Phase 3 Plan 04, D-07, STAT-01). The response is checked with a type guard before any of it is used.

| Part | What it does |
|------|--------------|
| `DASHBOARD_STATUSES`, `DashboardStatus` | The six statuses a staff member can filter by: `sent`, `opened`, `in_progress`, `waiting_on_staff`, `complete`, `revoked`. This list mirrors `worker/src/db/dashboard.ts`. It is copied rather than imported, because the SPA does not import Worker code. `draft` is never listed. |
| `RequestFilters` | `{ status?, q? }`, the filter shared by the route search params, `useRequests` and `fetchRequests`. |
| `DashboardRow` | One row as the Worker returns it: the `request_dashboard_v` columns (without `firm_id`) plus `client_name`. `overdue` and `last_activity_at` come from the view, and the SPA never computes them (D-06, D-07). |
| `STRINGS`, `NULLABLE` | The keys that must be strings and the keys that may be strings or `null`. |
| `isDashboardRow` | The row guard. Every key in `STRINGS` must be a string (including `client_name`), every key in `NULLABLE` must be a string or `null`, and `overdue` must be a boolean. |
| `isRequestsResponse` | `{ requests: DashboardRow[] }`, where every row passes `isDashboardRow`. |
| `fetchRequests({ status, q })` | Builds the query string with `URLSearchParams` and sends only the filters that are set, so no filter gives the bare `/api/admin/requests`. It calls the shared `api()` helper, which adds the staff bearer token and throws `ApiError` on a non-2xx status or a response that fails the guard. |

## Tests

`api.test.ts`:

- Only the filters that are set are sent, URL-encoded (`?status=sent&q=Ann+Lee`).
- A row without `client_name`, or with a non-boolean `overdue`, makes the call reject.
