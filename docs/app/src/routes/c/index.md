# `app/src/routes/c/index.tsx`

File route for `/c/`. Renders `PortalPage` from `features/client-portal/portal-page.tsx`: the intro and Start, the step list, or the invalid-link page when there is no client session (D-13). The Phase 1 placeholder (`NoLinkPage`) is gone.

- It sits directly under `__root`, with no `admin/` ancestor, so the admin shell and sidebar are never loaded on client pages (D-04). With `autoCodeSplitting` the route compiles to its own chunk (`c-*.js`). That chunk holds the portal code and copy and contains neither `SidebarProvider` nor `supabase` (checked after the build in Plan 02-08).
- The Worker serves `/c/` through the SPA fallback (`env.ASSETS.fetch`) with `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.
- It must not import from `@/components/layout`, `@/lib/api`, `@/lib/supabase`, `@/features/auth` or `@/features/dashboard`.

## Search params (Plan 06-06)

`validateSearch` keeps `step` and `signed` only when each is a UUID (case-insensitive pattern); anything else becomes `undefined` and is dropped from the URL (threat T-06-23). The Worker forwards only a UUID `step` from `/c/<token>?step=`, so this is the second check. `PortalPage` reads both with `useSearch({ from: '/c/' })`.
