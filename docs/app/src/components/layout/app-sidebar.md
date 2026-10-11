# `app/src/components/layout/app-sidebar.tsx`

The admin sidebar: title header, nav groups, user footer. Forked; `TeamSwitcher` replaced by `AppTitle`.

| Lines | What it does |
|-------|--------------|
| 1-8 | `useLayout` (collapsible/variant cookies) and the shadcn `Sidebar` parts. |
| 9-12 | `AppTitle`, the static `sidebarData`, `NavGroup`, `NavUser`. |
| 14-31 | Renders `Sidebar` with the layout-provider settings: header = `AppTitle`; content = one `NavGroup` per group in `sidebarData`; footer = `<NavUser />` (no props; it reads the signed-in staff member through `useStaffLabel()` and renders nothing until there is at least an email); `SidebarRail` for the collapse handle. |
