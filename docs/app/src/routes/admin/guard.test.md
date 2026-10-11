# `app/src/routes/admin/guard.test.tsx`

Vitest (`web` project, jsdom) for the `/admin/_shell` route guard and the open-redirect guard. Run with `pnpm -C app vitest run --project web src/routes/admin/guard.test.tsx`.

The file sits next to the routes, so `vite.config.ts` sets `routeFileIgnorePattern` to keep the TanStack router generator from treating it as a route.

| Part | What it does |
|------|--------------|
| `vi.mock('@/lib/supabase')` | Replaces the browser client with one whose `auth.getSession` each test controls. The guard's lazy `import()` gets the mock too. |
| `runGuard(href)` | Calls the real `Route.options.beforeLoad` with the only context field it reads (`location.href`). Returns `'passed'` or whatever was thrown. |
| no session | The thrown value passes `isRedirect`, with `to: '/admin/sign-in'` and `search.redirect` equal to the original href. |
| session present | The guard resolves and reads the session exactly once. |
| `safeRedirect` keeps | `/admin/x` and `/admin`. |
| `safeRedirect` rejects | `https://evil.example`, `//evil`, `undefined`, `/c/abc`, `/administrator`, and a backslash path. Each returns `/admin` (T-01-28). |
