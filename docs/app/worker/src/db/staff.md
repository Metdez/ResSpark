# `app/worker/src/db/staff.ts`

Reads a staff member's profile. Plan 06's session route uses it to cross-check the JWT's `app_metadata` claims against the database (D-15, Pattern 2: verify, then scope).

| Lines | What it does |
|-------|--------------|
| 1 | Uses the per-request admin client from `./client`. |
| 3-8 | `StaffProfile`: `user_id`, `firm_id`, `role` (`staff` or `admin`, the CHECK constraint on `staff_profiles.role`), and `display_name`. |
| 10-13 | `getStaffProfile(env, userId)` takes only the two Supabase secrets from `Env`, plus the user id taken from a verified JWT `sub`. |
| 14-18 | Runs `from('staff_profiles').select('user_id, firm_id, role, display_name').eq('user_id', userId).maybeSingle()`. It is scoped by `user_id` only: the primary key means at most one row, and `maybeSingle()` returns `null` instead of an error when there is none. The secret key bypasses RLS, so this `eq` is the scope. |
| 19 | Any error throws `Error('staff_lookup_failed')`. Postgres text is not passed on. |
| 20 | Returns the profile, or `null` for a user with no profile. Plan 06 answers that case with 403, so a rogue `authenticated` user without a profile gets no access. |

Proven live by `app/worker/test/events.test.ts`: the demo user resolves to the ValorTax firm, and the all-zero uuid returns `null`.
