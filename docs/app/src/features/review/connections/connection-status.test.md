# `app/src/features/review/connections/connection-status.test.ts`

Table-driven tests for every mapping in `connection-status.ts`.

| Block | Checks |
|-------|--------|
| `connectionBadge` | All six statuses and the three named error codes plus an unknown code, each to its exact `{ tone, label }`. |
| `transactionsLine` | `not_ready` and `initial` read `Syncing` even at 0 rows (PITFALLS M4); `historical` reads `Up to date`; `null` reads `Not started`. |
| `cellBadge` | The five cell statuses to their badges. |
| `employerCounts` | Joined plural counts, zero counts omitted, and `No documents yet` when all are zero. |
