# `app/worker/test/session.test.ts`

Live proof of PLAT-04 and PLAT-07 on the Worker: a real Supabase access token goes through `staffAuth` (live JWKS) and `/api/admin/session` writes real `events` rows. Run with `pnpm -C app run test:live`, which loads `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `DEMO_STAFF_EMAIL`, and `DEMO_STAFF_PASSWORD` from the git-ignored env files. Without them the suite is skipped (`describe.skipIf`).

## Setup

- Lines 9-17: reads the env and builds `ready`.
- Lines 19-43: `env` for the Worker (two secrets), a publishable-key client `anon` for sign-in, and helpers: `send` calls `app.request('/api/admin/session', …)`, `postEvent(event)` posts with the bearer token, `readEvent(id)` reads one row with the admin client.
- `beforeAll` silences the logger's `console.log`, signs in the demo staff user, and keeps the access token and user id. `afterAll` signs out.

## Tests

| Test | Proves |
|------|--------|
| POST signed_in | 200 with a numeric `event_id`; the row has `action 'staff.signed_in'`, `actor_type 'staff'`, `actor_id` = the user id, the seeded firm, and a `created_at` |
| three concurrent posts | three distinct ids (PLAT-04 concurrency edge) |
| GET | `user_id`, `firm_id`, `role`, `display_name` match `staff_profiles` |
| POST signed_out | a `staff.signed_out` row for the same user |
| POST without a token | 401 |

Rows written here stay: `events` is append-only. They are real staff events for the demo user.
