# `app/src/routes/admin/join.tsx`

File route for `/admin/join`. It renders `Join` from `app/src/features/auth/join/index.tsx`.

- It sits under `/admin`, so the SANDBOX banner from `admin/route.tsx` shows. It is outside the `_shell` layout, so the sign-in guard never runs here: the page is public.
- Search params: `token?: string` (zod), the raw invite token from the join link.
- The file is a single `createFileRoute(...)` call. The TanStack router plugin adds it to `routeTree.gen.ts` on build.
