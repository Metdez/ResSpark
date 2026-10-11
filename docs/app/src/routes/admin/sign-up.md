# `app/src/routes/admin/sign-up.tsx`

File route for `/admin/sign-up`. It renders `SignUp` from `app/src/features/auth/sign-up/index.tsx`.

- It sits under `/admin`, so the SANDBOX banner from `admin/route.tsx` shows. It is outside the `_shell` layout, so the sign-in guard never runs here: the page is public.
- Search params: none.
- The file is a single `createFileRoute(...)` call. The TanStack router plugin adds it to `routeTree.gen.ts` on build.
