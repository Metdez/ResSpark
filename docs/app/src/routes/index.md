# `app/src/routes/index.tsx`

File route for the bare site URL `/`.

Before this route existed, `/` matched nothing. The root route's `notFoundComponent` then showed the 404 page to anyone who typed the plain site address.

## What it does

| Line | What |
|---|---|
| 1 | Imports `createFileRoute` and `redirect` from TanStack Router. |
| 3 | Comment: `/` has no page of its own. |
| 4 | Registers the file route for `/` (the router plugin adds it to `routeTree.gen.ts`). |
| 5–7 | `beforeLoad` throws `redirect({ to: '/admin', replace: true })` before anything renders. `replace` keeps `/` out of the browser history, so Back does not bounce through it. |

The `/admin/_shell` guard does the rest. A visitor without a session goes on to `/admin/sign-in?redirect=…`, and a signed-in staff member lands on the dashboard.

Clients never use `/`. They arrive through `/c/<token>`.

## Test

`app/src/routes/index.test.tsx` calls the real `beforeLoad` and checks that it throws a TanStack redirect to `/admin`. The router plugin skips co-located `*.test.tsx` files (`routeFileIgnorePattern` in `vite.config.ts`).
