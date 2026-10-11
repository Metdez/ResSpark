# `app/src/lib/polling.ts`

One polling rule for every live screen in Phase 3 (D-08, STAT-02). Pass it straight to TanStack Query's `refetchInterval`, which accepts a function of the query.

| Part | What it does |
|------|--------------|
| `pollInterval(q)` | Takes the query (only `q.state.status` is read). Returns `30_000` (30 s) while the last fetch ended in `error`, otherwise `5_000` (5 s), including while `pending`. The 30 s backoff after an error is Claude's discretion under D-08: a failing Worker is not hammered every 5 s, and polling returns to 5 s on the next success. |
| Comment | Callers leave `refetchIntervalInBackground` at its default, `false`. TanStack Query's focus manager listens to `visibilitychange`, so a hidden tab stops polling and resumes when it becomes visible again. |

## Usage

```ts
useQuery({ queryKey, queryFn, refetchInterval: pollInterval })
```

Plans 03-02 to 03-05 use it for the client portal state, the request page, and the dashboard. This plan only adds the rule.

## Tests

`polling.test.ts` (`web` project): `success` and `pending` give 5000; `error` gives 30000.
