# `app/src/routes/c/index.tsx`

File route for `/c/`. Renders `NoLinkPage` from `features/client-link/no-link-page.tsx`.

- It sits directly under `__root`, with no `admin/` ancestor, so the admin shell and sidebar are never loaded on client pages (D-04). With `autoCodeSplitting` the route compiles to its own chunk that imports only `client-shell`, the card and the `Inbox` icon.
- The Worker serves `/c/` through the SPA fallback (`env.ASSETS.fetch`) with `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.
- It must not import from `@/components/layout`, `@/features/auth` or `@/features/dashboard`.
