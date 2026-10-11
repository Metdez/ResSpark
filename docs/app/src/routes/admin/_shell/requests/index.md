# `app/src/routes/admin/_shell/requests/index.tsx`

The file route for `/admin/requests` ("Requests" in the sidebar), inside the authenticated `_shell` layout.

| Part | What it does |
|------|--------------|
| `Route` | `createFileRoute('/admin/_shell/requests/')` with `RequestsRoute`. The trailing slash makes it the index of the `requests/` folder, beside `new.tsx` and `$requestId.tsx`. The router plugin adds it to `routeTree.gen.ts` on build. |
| `RequestsRoute` | Renders the admin chrome (`Header` with `Search`, `ThemeSwitch`, `ProfileDropdown`, then `Main`) around `RequestsListPage`. |
