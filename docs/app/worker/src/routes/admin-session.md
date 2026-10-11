# `app/worker/src/routes/admin-session.ts`

`/api/admin/session`, mounted in `index.ts`. It records staff sign-in and sign-out as audit events (D-16, PLAT-04) and tells the SPA who is signed in.

| Lines | What it does |
|-------|--------------|
| 1-4 | Hono, `HTTPException`, `logEvent` (the only event-writing path), and `staffAuth` with its `StaffCtx` type. |
| 6-7 | The two accepted events, `signed_in` and `signed_out`, and their union type. |
| 9-10 | `isSessionEvent`: a hand type guard; nothing else in the body is read. |
| 13 | The route's Hono instance, typed so `c.var.staff` is always set inside handlers. |
| 14 | `staffAuth` runs first for every method: 401 without a valid token, 403 without a matching profile. |
| 15-18 | `GET /` → `200 { user_id, firm_id, role, display_name, email }` from `c.var.staff`. The SPA's `useSession()` uses it for the sidebar and profile menu. It was added because nav-user needs `display_name` before Phase 2 builds `/api/admin/me`. |
| 19-21 | `POST /` parses JSON. A missing or non-JSON body becomes `null` instead of throwing. |
| 22-23 | Anything but `{ event: 'signed_in' | 'signed_out' }` → `HTTPException(400, 'bad_request')`. Throwing (not `c.json`) lets `onError` build the envelope and store `error_code` for the log line. Nothing is written (T-01-30). |
| 24-29 | One `logEvent` call: `firm_id` and `actor_id` come only from the verified context, `actor_type` is `staff`, and `action` is `staff.signed_in` or `staff.signed_out`. `created_at` is set by the database. |
| 30 | `200 { ok: true, event_id }`, where `event_id` is the new `events.id`. |

## Notes

- Each POST is one `log_event` insert with no shared state, so concurrent posts write one row each (proven live with three parallel posts).
- The SPA posts `signed_out` **before** `supabase.auth.signOut()`, while the token is still valid.

## Tests

- `app/worker/test/auth.test.ts` (unit): the `logEvent` call shape, body fields ignored, 400 for unknown event, empty body, and non-JSON body.
- `app/worker/test/session.test.ts` (live): real token → rows in `events`, three distinct ids, GET matches the profile.
