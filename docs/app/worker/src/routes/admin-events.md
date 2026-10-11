# `app/worker/src/routes/admin-events.ts`

The staff case timeline API (Plan 03-03; D-10, STAT-04 data for Plan 03-05), mounted in `index.ts` with `app.route('/api/admin', adminEventsRoute)`. It does not overlap Phase 2's `GET /api/admin/cases/:id` (lookup route), which matches one segment after `cases`.

## Contract

`GET /api/admin/cases/:id/events?before=<iso>&limit=<1..50>`

- 200 `{ events: EventRow[], next_before: string | null }`, newest first (`created_at DESC, id DESC`).
- 400 `bad_request` when `before` does not parse as a date.
- 401 / 403 from `staffAuth`; 404 `not_found` for a malformed id or a case of another firm.

## Code

| Part | What it does |
|------|--------------|
| `UUID` | A non-UUID case id → 404 before any query. |
| `MAX_LIMIT`, `parseLimit(raw)` | `limit` defaults to 50. A number is truncated and clamped to 1..50, so `limit=500` reads 50 rows. Anything that is not a number falls back to 50. |
| `before` | Optional. `Date.parse` must succeed (else 400); the value is normalized to ISO (`2026-10-10T00:00:00Z` → `2026-10-10T00:00:00.000Z`) before it reaches the query. |
| `listCaseEvents(...)` | Firm-scoped in SQL (`events.firm_id` and a `cases.firm_id` check). `null` means the case is not the firm's → 404. |
| `next_before` | The last row's `created_at` when exactly `limit` rows came back, otherwise `null`. The client passes it as `before` for the next page. |

Payloads go out as stored. The route is staff-only, and the payloads hold our own keys plus staff rejection notes, never tokens or URLs. The paging shortcut (a cursor on `created_at` only) is described in `docs/app/worker/src/db/review.md`.
