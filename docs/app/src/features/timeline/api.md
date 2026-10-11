# `app/src/features/timeline/api.ts`

The SPA's client for the case timeline route `GET /api/admin/cases/:id/events` (Worker: `app/worker/src/routes/admin-events.ts`, Plan 03-03). Plan 03-05; STAT-04.

| Part | What it does |
|------|--------------|
| `ActorType` | `staff`, `client`, `system`, or `provider`: the values the `events.actor_type` check constraint allows (migration `0002`). |
| `EventRow` | One event as the SPA reads it: `id` (a number, because `events.id` is `BIGINT` and PostgREST sends it as a JSON number), `actor_type`, `action`, `payload` (an object), `created_at` (ISO string). The Worker also sends `actor_id` and `request_id`; the SPA does not declare them, so the UI cannot print `actor_id` by accident (T-03-22). |
| `EventsResponse` | `{ events, next_before }`. `next_before` is the `created_at` of the last row when the page is full (50 rows), else `null`. |
| `isEvent` / `isEventsResponse` | Type guards at the API boundary. A row with an unknown actor type, a non-object payload, or a non-number id fails the whole response, which `api()` turns into an error, rather than casting untrusted JSON. |
| `fetchEvents(caseId, before?)` | Calls the route through the shared `api()` helper (bearer token, error mapping). The case id is URL-encoded; `before`, when given, is sent as `?before=` URL-encoded. No `limit` is sent, so the Worker's default and maximum of 50 applies. |

Paging: the Worker orders by `created_at DESC, id DESC` and filters `created_at < before`. Its cursor is `created_at` only (a known shortcut of Plan 03-03), so two events that share one timestamp across a page edge can be skipped; see the 03-05 SUMMARY.
