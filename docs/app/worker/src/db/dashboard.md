# `app/worker/src/db/dashboard.ts`

This module reads the staff request list from the `request_dashboard_v` view (migration 0004, Phase 3 Plan 01). It backs `GET /api/admin/requests`, which serves both the dashboard (`/admin`) and the Phase 2 requests page (`/admin/requests`), and since the Oct 12 call the `requests` list on `GET /api/admin/cases/:id`. Covers D-07, STAT-01, T-03-17 and T-03-18. The only caller is the Worker's service-role client. The view is `security_invoker`, and `anon` and `authenticated` have no grant on it.

| Lines | What it does |
|-------|--------------|
| 1 | The per-request admin (service-role) Supabase client. |
| 3 | `DbEnv`: this module needs only the two Supabase bindings. |
| 5-6 | `DASHBOARD_STATUSES` and `DashboardStatus`: the request statuses a staff member can filter by. `draft` is absent because a draft was never sent, so the dashboard never lists it. The route uses this list as the allowlist for `?status=`. |
| 8-25 | `DashboardRow`: one row of the response. It holds the view's columns (without `firm_id`) plus `client_name`. It is a superset of Phase 2's list row (`id`, `status`, `client_name`, `sent_at`, `expires_at`, `created_at`). |
| 27-28 | `COLUMNS`: the view columns that are read. `firm_id` is filtered on but not returned. |
| 30 | `Name`: the three fields `clientName` needs. |
| 32-34 | `clientName`: the single display-name rule. It joins the first and last name. If both are empty it uses the email, and if that is empty too it returns `Unknown client`. The SPA shows `row.client_name` and never rebuilds the name itself. |
| 36-44 | `sanitizeQuery`: keeps only `[A-Za-z0-9@._'\- ]`, collapses runs of spaces, trims, cuts to 64 characters, and trims again. It returns `''` when nothing is left. This matters because `q` is spliced into a PostgREST `or(...)` expression, where `,`, `(`, `)` and `*` would change the filter (T-03-17). `_` is allowed and acts as a one-character `ILIKE` wildcard, which is harmless for a name search. |
| 46-62 | `listDashboardRequests`: every query filters on `firm_id` first (T-03-18). With a status it adds `eq('status', ...)`, otherwise `neq('status', 'draft')`. A non-empty sanitized `q` adds a case-insensitive substring match on first name, last name, or email. Rows are ordered by `last_activity_at DESC NULLS LAST, id DESC`, so ties and requests with no events still come back in a stable order. The result is capped at 200 rows (see the `shortcut:` comment for when to move to keyset paging). Each row gets its `client_name`. Any PostgREST error becomes `requests_lookup_failed`, and the route's `onError` turns that into a 500 without the database message. |
| 64-72 | `CaseRequestRow`: one existing request of a case, for the builder's duplicate warning (Oct 12 call, I): `id`, `status`, `agent_display_name`, `sent_at`, `created_at`. |
| 74 | `CASE_REQUEST_COLUMNS`: the five view columns that row needs. |
| 76-87 | `listCaseRequests(env, firmId, caseId)`: the same view filtered on `firm_id` first, then `case_id`, with `revoked` left out (history, not a duplicate; drafts stay in because staff may already be working on one), ordered `created_at DESC`, capped at 20. Any PostgREST error becomes `requests_lookup_failed`. `GET /api/admin/cases/:id` (`routes/admin-lookup.ts`) returns the result as `requests`. |

## What the view derives

The view computes these fields, not this module or the SPA (D-06, D-07):

- `status` is `requests.status` as written by `request_apply_status()`.
- `last_activity_at` is the newest `events.created_at` for the request.
- `overdue` is true when `sent_at <= now() - 3 days` and the status is not `complete` or `revoked`. The boundary is inclusive.
- `expires_at` comes from the newest `client_links` version.

## Live check

The `or(...)` filter was run against the live PostgREST with `live.probe@example.com`, `O'Neil`, `Ann Smith ann@x.com` and `mary-jo_s`. Each query parsed without an error. Dots, spaces, apostrophes and `@` are all safe inside the value. Only `,` and `)` end a value in PostgREST's logic-tree parser, and the sanitizer removes both.

## Tests

`app/worker/src/db/dashboard.test.ts` covers `sanitizeQuery`, `clientName`, and `listCaseRequests` (with `./client` mocked by a chainable builder stand-in: the exact `from`/`select`/`eq`/`neq`/`order`/`limit` calls, the rows returned unchanged, and `requests_lookup_failed` on an error). The route behaviour is covered in `app/worker/test/admin-requests.test.ts`.
