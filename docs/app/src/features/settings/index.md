# `app/src/features/settings/index.tsx`

Settings page frame rendered at `/admin/settings`: header, title, side nav, and an `Outlet` for the
sub-page. Forked; the nav is trimmed to Appearance and the `ConfigDrawer` is gone.

| Lines | What it does |
|-------|--------------|
| 1-9 | `Outlet`, Lucide `Palette`, `Separator`, shell `Header`/`Main`, header controls, `SidebarNav`. |
| 11-17 | `sidebarNavItems`: the single **Appearance** entry -> `/admin/settings/appearance`. |
| 19-26 | `Header` with search, theme switch, profile menu. |
| 28-45 | `Main fixed`: Display title `Settings` and a one-line description, separator, then the side nav (`SidebarNav`, a select on small screens) beside the `Outlet`. |
