# `app/src/lib/session.ts`

The SPA's staff-session helpers (D-16, PLAT-07): who is signed in, what the sidebar shows, how to sign out, and where a `?redirect=` may send the user.

| Lines | What it does |
|-------|--------------|
| 1-2 | TanStack Query's `useQuery` and the `api()` boundary with its `isObject`/`isOk` guards. Supabase is **not** imported statically: `supabase.ts` throws at load in a build without `VITE_SUPABASE_*`, and this module is reached from the main bundle (`main.tsx`). |
| 4-10 | `SessionInfo`: the `GET /api/admin/session` body: `user_id`, `firm_id`, `role` (`staff` or `admin`), `display_name`, optional `email`. |
| 12-18 | `isSessionInfo`: a type guard that checks every field, so an unexpected body becomes an `ApiError('invalid_response')` instead of bad data in the UI. |
| 20-26 | `useSession()`: query key `['session']`, fetched through `api()` with the bearer token. A 401 here reaches the QueryClient's error handler in `main.tsx`, which treats it as "signed out". |
| 28-48 | `useStaffLabel()`: what `nav-user` and `profile-dropdown` display. `name` is `display_name` once the session query resolves. `email` is the session email, or, while that query loads or when it failed (for example 403, no profile), the email from the stored Supabase session (query key `['auth-email']`, read once, never stale). `initial` is the first letter of the name or email for the avatar. A failed Supabase import yields `null`, never an error toast. |
| 50-53 | `signOutEverywhere(reason?)`. "Everywhere" means the audit event, Supabase, and the browser. It never throws. It returns the event-post error (or `null`) so the sign-out dialog can show the generic toast. Callers clear the query cache themselves, because only they hold the `QueryClient`, and they clear it after navigating away from the shell so no mounted query refetches without a token. |
| 54-65 | Unless `reason === 'expired'`, posts `{ event: 'signed_out' }` **before** signing out, while the token is still valid. With `'expired'` the Worker already rejected the token, so the post is skipped. |
| 66-74 | Lazily imports the Supabase client and calls `signOut({ scope: 'local' })`. Local scope ends this browser's session only (revoking its refresh token), so a shared demo login on another machine is not kicked out. supabase-js 2.117.3 removes the stored session even when the network call fails, so a user is never trapped signed in. A missing client means there is no session to clear. |
| 77-78 | `ADMIN_PATH`: `/admin` followed by the end of the string, `/`, `?`, or `#`. So `/admin`, `/admin/x`, and `/admin?tab=1` pass, and `/administrator` does not. |
| 80-84 | `safeRedirect(value)`: returns the value only when it is a string matching `ADMIN_PATH` with no backslash; otherwise `/admin`. A scheme (`https://…`) or `//host` can never match, because the value must start with `/admin` (T-01-28). |

## Tests

`app/src/routes/admin/guard.test.tsx` covers `safeRedirect`. The 401 path is covered by `app/src/lib/handle-server-error.test.ts`; the sign-out flow end to end is a human check on the deployed URL.
