# `app/src/routes/admin/_shell/requests/new.tsx`

The file route for `/admin/requests/new?case=<uuid>`, inside the authenticated `_shell` layout.

| Part | What it does |
|------|--------------|
| `searchSchema` | `z.object({ case: z.uuid() })`. Zod 4's top-level `z.uuid()`; the chained string-then-uuid form is deprecated in the installed `zod@4.3.6`. A missing or malformed `case` fails route validation, so the builder never asks the Worker for a non-uuid id. |
| `Route` | `createFileRoute('/admin/_shell/requests/new')` with `validateSearch` and `NewRequestRoute`. |
| `NewRequestRoute` | Reads `case` from the typed search, renders the admin chrome (`Header` with `Search`, `ThemeSwitch`, `ProfileDropdown`, then `Main`) around `RequestBuilder`, and on create navigates to `/admin/requests/$requestId` with `replace: true` so Back does not return to a builder for a request that already exists. |

## Notes

- Reached from the lookup confirm: `navigate({ to: '/admin/requests/new', search: { case: caseId } })`.
- The router plugin adds the route to `routeTree.gen.ts` on build.
