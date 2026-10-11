# `app/src/features/client-portal/connect/use-item-connection.ts`

TanStack Query wrapper for `getItemConnection`.

- `ACTIVE` / `isActive(status)`: true for `pending`, `connected`, and `syncing` (the provider is still delivering); false for `done`, `error`, `removed`, or no connection.
- `itemConnectionQuery(itemId, enabled)`: the query options (built with `queryOptions`), exported so the polling rule can be tested without rendering.
  - Key `['portal', 'connection', itemId]`.
  - `enabled`: the sheet is open.
  - `retry: false`: a failure shows its copy at once.
  - `refetchInterval`: 5 000 ms while `enabled` and the connection is active, otherwise `false`, so polling stops at done or error and when the sheet closes.
- `useItemConnection(itemId, enabled)`: `useQuery(itemConnectionQuery(itemId, enabled))`.

Tested in `payroll-step.test.tsx` (5 000 for `pending`, `false` for `done`, `false` when not enabled).
