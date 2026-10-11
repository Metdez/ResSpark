# `app/worker/src/routes/admin-events.test.ts`

Unit tests for `admin-events.ts` in the `worker-node` Vitest project. `verifyStaffJwt` and `getStaffProfile` are mocked so the real `staffAuth` lets staff `U1` of firm `F1` through; `listCaseEvents` is mocked (the rest of `db/review`, including `beforeFilter`, is real).

## Cases

- Three rows back with the default limit → `{ events, next_before: null }` and the call `(env, 'F1', caseId, null, 50)`.
- `?limit=2` with two rows back → `next_before` is the second row's `created_at|id`.
- `?limit=500` → the query is called with 50.
- `?before=not-a-date` → 400 `bad_request`, no query.
- Cursor round-trip: a page ending on a row with a microsecond `created_at` and id 7 yields `...123456+00:00|7`; sending it back calls `listCaseEvents` with `{ ts: <same raw string>, id: 7 }`.
- Tie at the page edge: `beforeFilter` asks for `created_at < ts` or (`created_at = ts` and `id < 7`), so a row sharing the edge timestamp with a lower id is on the next page.
- Malformed cursors (no id, non-integer id, three parts, bad timestamp, filter syntax in the timestamp) → 400, no query.
- `listCaseEvents` returns `null` (case of another firm) → 404.
