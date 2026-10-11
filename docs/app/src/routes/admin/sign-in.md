# `app/src/routes/admin/sign-in.tsx`

Route for `/admin/sign-in`. Moved from the fork's `(auth)/sign-in.tsx`; same component and search schema.

| Lines | What it does |
|-------|--------------|
| 1-3 | Zod, `createFileRoute`, the `SignIn` feature component. |
| 5-7 | Search-param schema: optional `redirect` (where to go after signing in). |
| 9-12 | Registers the route with `validateSearch` so `useSearch({ from: '/admin/sign-in' })` is typed. |

## Notes

- Lives outside the pathless `_shell` layout so it is reachable without a session.
- The `redirect` value is untrusted. The sign-in form passes it through `safeRedirect` (`src/lib/session.ts`), so only `/admin…` paths are followed (T-01-28).
