# `app/src/routes/admin/route.tsx`

Layout route for everything under `/admin`. It renders the SANDBOX banner and then an `Outlet`, so the public `/admin/sign-in` page and the guarded `_shell` tree share one parent and one banner (D-04, D-19).

| Lines | What it does |
|-------|--------------|
| 1 | `createFileRoute` and `Outlet` from TanStack Router. |
| 2 | `SandboxBanner` from `features/layout`. |
| 4-11 | `/admin` route whose component renders `<SandboxBanner />` above `<Outlet />`. The banner is sticky at the top, and the child page renders below it. |

## Notes

- No `beforeLoad` here on purpose: guarding this route would also guard `/admin/sign-in` and loop (RESEARCH Pitfall 5). The guard belongs on `_shell/route.tsx` (Plan 06).
- The shell's fixed sidebar and sticky header are offset under the banner in `styles/index.css`, not here, so the vendored layout components stay untouched.

## Tests

- No route-level test. The banner's behaviour is covered by `sandbox-banner.test.tsx`, and the mount is confirmed by the live bundle check plus the end-of-phase visual check.
