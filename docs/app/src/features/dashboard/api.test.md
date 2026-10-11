# `app/src/features/dashboard/api.test.ts`

Unit tests for `fetchRequests` and its response guard. They run in the `web` Vitest project. `@/lib/supabase` is mocked with no session, so `api()` sends no bearer token, and `reply()` stubs `fetch` with one 200 JSON body.

- `ROW` is a valid `DashboardRow`.
- A bare call goes to `/api/admin/requests`. A call with a filter goes to `/api/admin/requests?status=sent&q=Ann+Lee`.
- A row without `client_name`, and a row whose `overdue` is a string, both make the call reject.
