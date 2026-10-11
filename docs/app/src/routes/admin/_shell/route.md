# `app/src/routes/admin/_shell/route.tsx`

Pathless layout route (`_shell` never appears in the URL) that wraps every signed-in admin page in the sidebar shell, and guards it (D-16, PLAT-07). Moved from the fork's `_authenticated/route.tsx`.

| Lines | What it does |
|-------|--------------|
| 1-2 | `createFileRoute`, `redirect`, and the `AuthenticatedLayout` (sidebar + header + main). |
| 4-5 | Why the guard is here: it is UX only, because the Worker verifies every `/api/admin/*` call; `/admin/sign-in` sits outside this layout, so it can never redirect to itself (RESEARCH Pitfall 5). |
| 6 | Route id `/admin/_shell`. |
| 7-14 | `beforeLoad`: imports the Supabase client lazily (a static import would crash every route, including `/c/*`, in a build without `VITE_SUPABASE_*`), reads the stored session with `getSession()`, and with no session throws `redirect({ to: '/admin/sign-in', search: { redirect: location.href } })`. `location.href` keeps the path and query. The sign-in form only honours it if `safeRedirect` accepts it. |
| 15 | `pendingComponent` renders nothing: a blank screen while the check runs, never a flash of the sign-in page (UI-SPEC Loading). |
| 16 | Component `AuthenticatedLayout`. |

## Notes

- Children: `_shell/index.tsx` (`/admin`), `_shell/settings/route.tsx` (`/admin/settings`), `_shell/settings/appearance.tsx`.
- "Stay signed in across refresh" comes from supabase-js keeping the session in `localStorage` with auto-refresh. If the Worker later rejects the token (401), `handle-server-error.ts` signs the user out and sends them back here.
- Tests: `app/src/routes/admin/guard.test.tsx`.
