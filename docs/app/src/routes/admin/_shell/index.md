# `app/src/routes/admin/_shell/index.tsx`

Index route of the shell: `/admin` renders the dashboard. Since Phase 3 Plan 04 it also owns the dashboard's URL filter, `?status=&q=`.

| Lines | What it does |
|-------|--------------|
| 1-4 | Zod, `createFileRoute`, the `Dashboard` feature component, and `DASHBOARD_STATUSES` from the dashboard API module. |
| 6-10 | `searchSchema`: `status` must be one of the six dashboard statuses, and `q` is a string of at most 64 characters. Both are optional. `.catch(undefined)` turns a bad hand-edited value (for example `?status=bogus`) into "no filter" instead of an error page. The Worker checks both again, because the URL is untrusted. |
| 12-15 | Route id `/admin/_shell/` (the trailing slash marks the index of the pathless layout), with `validateSearch: searchSchema` and component `Dashboard`. `Filters` and `RequestTable` read the result with `useSearch({ from: '/admin/_shell/' })`. |
