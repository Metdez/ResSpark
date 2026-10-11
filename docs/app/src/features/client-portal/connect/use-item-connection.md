# `app/src/features/client-portal/connect/use-item-connection.ts`

TanStack Query wrapper for `getItemConnection`.

- `ACTIVE` / `isActive(status)`: true for `pending`, `connected`, and `syncing` (the provider is still delivering); false for `done`, `error`, `removed`, or no connection.
- `itemConnectionQuery(itemId, enabled)`: the query options (built with `queryOptions`), exported so the polling rule can be tested without rendering.
  - Key `['portal', 'connection', itemId]`.
  - `enabled`: the sheet is open.
  - `retry: false`: a failure shows its copy at once.
  - `refetchInterval`: 5 000 ms while `enabled` and the connection is active, otherwise `false`, so polling stops at done or error and when the sheet closes.
  - `employerInProgress(view)`: a `done` view that still lists a `pending` or `connected` employer also polls. The server merges every payroll order on the item, so a done first employer can sit beside a newer order still in progress (follow-up fix 2026-10-11). An `error` view never polls.
- `useItemConnection(itemId, enabled)`: `useQuery(itemConnectionQuery(itemId, enabled))`.

Tested in `payroll-step.test.tsx` (5 000 for `pending`, `false` for `done`, 5 000 for `done` with a pending employer, `false` for `error` with one, `false` when not enabled).

## `useRejectionNote(step, open)`

`/api/c/state` steps carry no `rejection_note`, so this reads it from `listItemDocuments(step.id).item.rejection_note`. Query key `['portal', 'item', step.id, 'documents']`, the same key `UploadSheet` uses, so the two share one fetch. Enabled only while the sheet is open and `step.status === 'rejected'`; `retry: false`. Returns the note or `null`.
