# `app/src/routes/admin/_shell/settings/route.tsx`

Layout route for `/admin/settings`: renders the `Settings` page frame (title, side nav, `Outlet`).

| Lines | What it does |
|-------|--------------|
| 1-2 | `createFileRoute` and the `Settings` feature component. |
| 4-6 | Route id `/admin/_shell/settings`, component `Settings`. |

## Notes

- The fork's settings index (Profile), account, display, and notifications pages were not copied; the only child is `appearance.tsx`.
