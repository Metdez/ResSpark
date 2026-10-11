# `app/worker/src/routes/admin-events.ts`

The staff case timeline API (Plan 03-03; D-10, STAT-04 data for Plan 03-05), mounted in `index.ts` with `app.route('/api/admin', adminEventsRoute)`. It does not overlap Phase 2's `GET /api/admin/cases/:id` (lookup route), which matches one segment after `cases`.

## Contract

`GET /api/admin/cases/:id/events?before=<cursor>&limit=<1..50>`

- 200 `{ events: EventRow[], next_before: string | null }`, newest first (`created_at DESC, id DESC`).
- 400 `bad_request` when `before` is not a well-formed cursor.
- 401 / 403 from `staffAuth`; 404 `not_found` for a malformed id or a case of another firm.

## Code

| Part | What it does |
|------|--------------|
| `UUID` | A non-UUID case id → 404 before any query. |
| `MAX_LIMIT`, `parseLimit(raw)` | `limit` defaults to 50. A number is truncated and clamped to 1..50, so `limit=500` reads 50 rows. Anything that is not a number falls back to 50. |
| `TS`, `parseCursor(raw)` | `before` is optional and opaque: `"<created_at>|<id>"`. It must split into exactly two parts; the timestamp must match `TS` (Postgres timestamptz shape, up to 6 fractional digits, `Z` or an offset) and pass `Date.parse`; the id must be digits. Anything else → `null` → 400. The timestamp is passed on as the raw string (no `toISOString`), so microseconds survive. |
| `listCaseEvents(...)` | Firm-scoped in SQL (`events.firm_id` and a `cases.firm_id` check). `null` means the case is not the firm's → 404. |
| `next_before` | `"<created_at>|<id>"` of the last row when exactly `limit` rows came back, otherwise `null`. The client passes it back verbatim as `before` (`features/timeline/api.ts` does not parse it). |

Payloads go out as stored. The route is staff-only, and the payloads hold our own keys plus staff rejection notes, never tokens or URLs. The `(created_at, id)` filter is described in `docs/app/worker/src/db/review.md`.
