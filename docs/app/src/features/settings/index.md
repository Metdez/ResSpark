# `app/src/features/settings/index.tsx`

Settings page frame rendered at `/admin/settings`: header, title, side nav, and an `Outlet` for the
sub-page. Forked; the nav holds Appearance, Integrations (Plan 02-06) and Team (staff accounts) and the `ConfigDrawer` is gone.

| Lines | What it does |
|-------|--------------|
| 1-9 | `Outlet`, Lucide `Palette` and `Plug`, `Separator`, shell `Header`/`Main`, header controls, `SidebarNav`. |
| 11-27 | `sidebarNavItems`: **Appearance** -> `/admin/settings/appearance`, **Integrations** -> `/admin/settings/integrations`, and **Team** -> `/admin/settings/team` (`Users` icon; see `features/settings/team/team-page.md`). The page subtitle reads "Choose how the app looks, connect your firm's services, and manage your team." |
| 24-31 | `Header` with search, theme switch, profile menu. |
| 33-50 | `Main fixed`: Display title `Settings` and the one-line description `Choose how the app looks and connect your firm's services.`, separator, then the side nav (`SidebarNav`, a select on small screens) beside the `Outlet`. |
