# `app/src/features/review/use-review.ts`

TanStack Query hooks for the review panel (Plan 03-03; D-08, STAT-02).

| Part | What it does |
|------|--------------|
| `useReview(requestId)` | `useQuery` keyed `['review', requestId]`, fetching `fetchReview`. `refetchInterval: pollInterval` polls every 5 s, or every 30 s after an error (Plan 03-06). `refetchIntervalInBackground` stays at its default `false`, so a hidden tab stops polling. `placeholderData: keepPreviousData` keeps the last rows on screen during a refetch. `meta: { errorShown: true }` tells the app-wide handler that the panel shows its own error, so only a 401 goes on to sign the user out. |
| `useDecision(requestId, caseId, mutationFn)` | The shared mutation behind both decisions. |
| `onSuccess` | Reads the cached review's request status before the refetch. If the decision turned the request `complete` and it was not complete before, it shows `toast.success('Request complete')`. That is the only toast on success; the badges carry the rest. |
| `onError` | `unlessHandled` from Phase 2: every error except a 401 is shown in place by the panel; a 401 goes to the app handler (sign out). |
| `onSettled` | Runs after success and after an error (a 409 means the item changed under us, so the truth is refetched). It invalidates `['review', requestId]`, `['request', requestId]` (the page header badge), `['requests']` (the dashboard, every filter), and `['events', caseId]` (the timeline of Plan 03-05). The change is visible on the next fetch, without a reload. |
| `useApprove(requestId, caseId)` | `mutate(itemId)` → `approve(itemId)`. |
| `useReject(requestId, caseId)` | `mutate({ itemId, note })` → `reject(itemId, note)`. |
