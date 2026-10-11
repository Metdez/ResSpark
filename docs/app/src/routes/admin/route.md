# `app/src/routes/admin/route.tsx`

Layout route for everything under `/admin`. It renders only an `Outlet` so both the public
`/admin/sign-in` page and the guarded `_shell` tree share one parent (D-04).

| Lines | What it does |
|-------|--------------|
| 1 | `createFileRoute` and `Outlet` from TanStack Router. |
| 3 | Plan 03 mounts the SANDBOX banner in this component so it sits above the sign-in page and the shell alike. |
| 4-6 | `/admin` route whose component is `Outlet` itself. |

## Notes

- No `beforeLoad` here on purpose: guarding this route would also guard `/admin/sign-in` and loop (RESEARCH Pitfall 5). The guard belongs on `_shell/route.tsx` (Plan 06).
