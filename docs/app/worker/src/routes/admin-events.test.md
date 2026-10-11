# `app/worker/src/routes/admin-events.test.ts`

Unit tests for `admin-events.ts` in the `worker-node` Vitest project. `verifyStaffJwt` and `getStaffProfile` are mocked so the real `staffAuth` lets staff `U1` of firm `F1` through; `listCaseEvents` is mocked (the rest of `db/review` is real).

## Cases

- Three rows back with the default limit → `{ events, next_before: null }` and the call `(env, 'F1', caseId, null, 50)`.
- `?limit=2` with two rows back → `next_before` is the second row's `created_at`.
- `?limit=500` → the query is called with 50.
- `?before=not-a-date` → 400 `bad_request`, no query.
- `?before=2026-10-10T00:00:00Z` → passed on as `2026-10-10T00:00:00.000Z`.
- `listCaseEvents` returns `null` (case of another firm) → 404.
