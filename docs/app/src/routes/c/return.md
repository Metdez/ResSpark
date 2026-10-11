# `app/src/routes/c/return.tsx`

File route for `/c/return`. Renders `ReturnPage` from `features/client-portal/connect/return-page.tsx`.

- The bank's hosted link sends the client to `/c/return?nonce=…`. The Worker (`worker/src/routes/c-return.ts`, registered before `/c/:token`) redeems the single-use nonce, queues a reconcile, and redirects to `/c/return` with no query. Without a nonce the Worker serves the SPA, which renders this route.
- In the SPA a static segment (`return`) wins over the dynamic `$token`, so this route is matched instead of the invalid-link page.
- The TanStack router plugin adds it to `routeTree.gen.ts` on build (`CReturnRoute`, path `/c/return`, parent: root).
- Like the other `/c` routes, it has no admin ancestor and imports nothing from the admin shell.
