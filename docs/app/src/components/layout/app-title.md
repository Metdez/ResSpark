# `app/src/components/layout/app-title.tsx`

Sidebar header: the product name as a link to `/admin` plus the sidebar toggle. Forked; the hardcoded
"Shadcn-Admin" / "Vite + ShadcnUI" text became `VITE_APP_NAME`.

| Lines | What it does |
|-------|--------------|
| 1-10 | Router `Link`, Lucide `Menu`/`X`, `cn`, shadcn sidebar menu parts, `Button`. |
| 12 | `appName` from `import.meta.env.VITE_APP_NAME`, falling back to `ResSpark` (CONTEXT: keep the company name configurable). |
| 14-40 | `AppTitle`: a `SidebarMenuButton` holding a `Link to='/admin'` (closes the mobile sheet on click) that shows `appName` truncated with the full text in `title`, followed by `ToggleSidebar`. |
| 42-67 | `ToggleSidebar`: ghost icon button that calls `toggleSidebar()`; shows `X` on mobile and `Menu` on desktop, with an sr-only label. |

## Notes

- Phase 2 swaps `appName` for `firms.name` once `/api/admin/me` exists (UI-SPEC Design System).
