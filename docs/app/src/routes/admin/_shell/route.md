# `app/src/routes/admin/_shell/route.tsx`

Pathless layout route (`_shell` never appears in the URL) that wraps every signed-in admin page in
the sidebar shell. Moved from the fork's `_authenticated/route.tsx`.

| Lines | What it does |
|-------|--------------|
| 1-2 | `createFileRoute` and the `AuthenticatedLayout` (sidebar + header + main). |
| 4 | Plan 06 adds `beforeLoad` here: no Supabase session -> `redirect({ to: '/admin/sign-in', search: { redirect } })`. |
| 5-7 | Route id `/admin/_shell`, component `AuthenticatedLayout`. |

## Notes

- Children: `_shell/index.tsx` (`/admin`), `_shell/settings/route.tsx` (`/admin/settings`), `_shell/settings/appearance.tsx`.
