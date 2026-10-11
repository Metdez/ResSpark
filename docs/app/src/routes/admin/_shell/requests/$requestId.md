# `app/src/routes/admin/_shell/requests/$requestId.tsx`

The file route for `/admin/requests/$requestId`, inside the authenticated `_shell` layout (so the sign-in guard and sidebar apply).

| Part | What it does |
|------|--------------|
| `Route` | `createFileRoute('/admin/_shell/requests/$requestId')` with `RequestRoute` as the component. The TanStack router plugin adds it to `routeTree.gen.ts` on build. |
| `RequestRoute` | Reads `requestId` from the typed params and renders the admin page chrome (`Header` with `Search`, `ThemeSwitch`, `ProfileDropdown`, then `Main`, the same as the dashboard) around `RequestPage`. |

## Notes

- The chrome lives here, not in the feature, so `RequestPage` renders in tests without the sidebar, search, and router providers.
- Callers reach this route from the builder: `navigate({ to: '/admin/requests/$requestId', params: { requestId } })`.
