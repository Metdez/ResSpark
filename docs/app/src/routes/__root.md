# `app/src/routes/__root.tsx`

The TanStack Router root route. Every page, admin and client, renders inside it. Originally vendored from `satnaing/shadcn-admin@e16c87f`; Plan 01-07 edited it (Toaster position), so it now has this doc instead of a row in `VENDORED.md`.

| Lines | What it does |
|-------|--------------|
| 1-12 | Imports: the `QueryClient` type, router helpers (`createRootRouteWithContext`, `Outlet`, `useRouterState`), the dev-only devtools, the app `Toaster`, `NavigationProgress`, and the error and not-found pages. |
| 14-22 | `RootToaster`: the one Toaster in the app. It reads the current pathname and positions toasts `top-center` on client pages (`/c` and `/c/*`) and `top-right` on admin pages (UI-SPEC S5 and the `sonner` row). It is a named component so the router hook follows the rules of hooks. |
| 24-26 | The root route, typed with the router context `{ queryClient }` that `main.tsx` provides. |
| 27-41 | Layout: the route-transition progress bar, the matched child route (`Outlet`), the Toaster, and the React Query and Router devtools in development only. |
| 42-43 | Fallback pages for unknown routes and render errors. |

## Notes

- Client pages under `/c/*` render here directly, with no `admin/` ancestor, so they never load the admin shell (D-04). Their layout is `features/client-link/client-shell.tsx`.
- ESLint reports a `react-refresh/only-export-components` warning for this file because it defines `RootToaster` next to the exported `Route`. It affects hot reload only.
