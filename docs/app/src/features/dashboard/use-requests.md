# `app/src/features/dashboard/use-requests.ts`

`useRequests({ status, q })` is the dashboard's live query (Phase 3 Plan 04, D-08, STAT-02).

| Option | Why |
|--------|-----|
| `queryKey: ['requests', status ?? 'all', q ?? '']` | The key includes the filter, so a poll response for one filter is cached under that filter and never shows under another. The `['requests']` prefix means `invalidateQueries({ queryKey: ['requests'] })` from any mutation (approve, reject, revoke) refreshes the dashboard and the Phase 2 list straight away instead of waiting for the next tick. |
| `queryFn: () => fetchRequests({ status, q })` | Fetches with exactly the values in the key. Destructuring the argument keeps the `@tanstack/query/exhaustive-deps` lint rule satisfied. |
| `refetchInterval: pollInterval` | Polls every 5 s, or every 30 s while the query is in error (`lib/polling.ts`). `refetchIntervalInBackground` is left at its default `false`, so a hidden tab stops polling and refetches when it becomes visible again. Polling only: no Realtime, WebSockets or server-sent events (plan prohibition). |
| `placeholderData: keepPreviousData` | While a new filter loads, the previous rows stay on screen, so there is no skeleton flash between chips. Two identical poll responses keep the same row references (TanStack structural sharing), so nothing re-renders visibly. |
| `meta: { errorShown: true }` | The table shows its own error (an alert or the inline "retrying" notice), so the global query error handler does not also raise a toast (02-08 convention). A 401 still signs the user out. |

## Tests

`use-requests.test.ts` mocks `useQuery` and inspects the options it receives:

- `refetchInterval` is `pollInterval`, `placeholderData` is `keepPreviousData`, and `refetchIntervalInBackground` is not set.
- The key is `['requests', 'all', '']` with no filter and `['requests', 'complete', 'ann']` with one.
- The `queryFn` calls `fetchRequests` with the same filter.
