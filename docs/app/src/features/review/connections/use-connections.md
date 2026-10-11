# `app/src/features/review/connections/use-connections.ts`

TanStack Query hooks for the staff connection view (Plan 04-06).

| Hook | What it does |
|------|--------------|
| `useConnections(requestId)` | Query `['connections', requestId]` over `fetchConnections`. `refetchInterval: pollInterval` polls every 5 s while the tab is visible and backs off to 30 s after an error (D-08). `placeholderData: keepPreviousData` keeps the cards on screen during a refetch. `meta.errorShown` tells the app-wide handler the panel shows its own error, so only a 401 goes on to the global toast. |
| `useRefreshConnection(requestId)` | Mutation over `refreshConnection(connectionId)`. `onError: unlessHandled(...)` keeps every non-401 `ApiError` away from the global handler, because the card shows its own toast. `onSettled` (also after an error) invalidates `['connections', requestId]` so the badge follows what the server now knows, and `['review', requestId]` because a finished sync can add documents to the review panel. Refresh never sets a status itself (D-04). |
| `useTransactions(connectionId, months, enabled)` | Query `['transactions', connectionId, months]` over `fetchTransactions`. `enabled` is false until the `Transactions` disclosure is opened, so a closed card fetches nothing. No polling: the table is a point-in-time read. |
