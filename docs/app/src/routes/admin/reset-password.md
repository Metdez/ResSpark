# `app/src/routes/admin/reset-password.tsx`

File route for `/admin/reset-password`. It renders `ResetPassword` from `app/src/features/auth/reset-password/index.tsx`.

- It sits under `/admin`, so the SANDBOX banner from `admin/route.tsx` shows. It is outside the `_shell` layout, so the sign-in guard never runs here: the page is public.
- Search params: `token_hash?: string` (zod), the one-time recovery token hash from the reset link.
- The file is a single `createFileRoute(...)` call. The TanStack router plugin adds it to `routeTree.gen.ts` on build.
