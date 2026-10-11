# `app/src/components/layout/types.ts`

Types for the sidebar data. Forked; the `Team` type and `teams` field are gone (team switcher deleted)
and `user` became optional.

| Lines | What it does |
|-------|--------------|
| 1 | `LinkProps` from TanStack Router, used to type nav URLs against the route tree. |
| 3-7 | `User`: name, email, avatar — what `NavUser` displays. |
| 9-13 | `BaseNavItem`: title, optional badge and icon. |
| 15-18 | `NavLink`: a leaf item with a `url` (typed route path or any string). |
| 20-23 | `NavCollapsible`: a group with sub-items and no own `url`. |
| 25-30 | `NavItem` union and `NavGroup` (title + items). |
| 32-35 | `SidebarData`: optional `user`, required `navGroups`. |
| 37 | Exports, including `User` for `NavUser`. |
