# `app/src/components/layout/data/sidebar-data.ts`

Static sidebar navigation (UI-SPEC S2). Rewritten from the fork: no Clerk logo, no teams, no fake user,
no links to pages that do not exist.

| Lines | What it does |
|-------|--------------|
| 1-2 | Lucide icons and the `SidebarData` type. |
| 4-42 | `sidebarData.navGroups`: group **Work** -> **Dashboard** (`/admin`, `LayoutDashboard`), **Find a client** (`/admin/lookup`, `Search`, Plan 02-05), and **Requests** (`/admin/requests`, `Send`, Plan 02-06); group **Account** -> **Appearance** (`/admin/settings/appearance`, `Palette`), **Integrations** (`/admin/settings/integrations`, `Plug`, Plan 02-06), and **Team** (`/admin/settings/team`, `Users`, staff accounts). |

## Notes

- `user` is intentionally absent; `NavUser` renders nothing until Plan 06 passes the signed-in staff user.
- `AppSidebar` renders the groups; `CommandMenu` lists the same items for the palette, so nav changes happen here once.
