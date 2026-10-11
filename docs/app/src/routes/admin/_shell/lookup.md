# `app/src/routes/admin/_shell/lookup.tsx`

The file route for `/admin/lookup` ("Find a client" in the sidebar), inside the authenticated `_shell` layout.

| Part | What it does |
|------|--------------|
| `Route` | `createFileRoute('/admin/_shell/lookup')` with `LookupRoute`. The router plugin adds it to `routeTree.gen.ts` on build. |
| `LookupRoute` | Renders the admin chrome (`Header` with `Search`, `ThemeSwitch`, `ProfileDropdown`, then `Main`) around `LookupPage`. When staff confirm a case, it navigates to `/admin/requests/new` with `search: { case: caseId }`, which opens the request builder for that case. |
