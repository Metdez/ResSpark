# `app/src/features/auth/sign-in/index.tsx`

The sign-in page body. Forked; reads `redirect` from the new route id and drops the sign-up link and
the terms footer (no such flows exist).

| Lines | What it does |
|-------|--------------|
| 1-10 | `useSearch`, `Card` parts, `AuthLayout` (centered column with the app title), `UserAuthForm`. |
| 12-13 | Reads the typed `redirect` search param from `/admin/sign-in`. |
| 15-29 | `AuthLayout` around a `Card`: title `Sign in`, one-sentence description, and `UserAuthForm redirectTo={redirect}`. |

## Notes

- Plan 06 rewrites `components/user-auth-form.tsx` against Supabase Auth and applies the UI-SPEC S1 copy ("Sign in to ResSpark", field validation strings, form-level `Alert`).
