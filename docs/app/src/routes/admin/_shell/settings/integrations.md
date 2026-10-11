# `app/src/routes/admin/_shell/settings/integrations.tsx`

Route for `/admin/settings/integrations` (the IRS Logics and e-sign settings page), a child of the settings layout.

| Lines | What it does |
|-------|--------------|
| 1-3 | `createFileRoute`, the `EsignTemplatesCard` (Plan 06-05), and the `LogicsSettingsPage` feature component. |
| 5-11 | Route id `/admin/_shell/settings/integrations`. The component renders `LogicsSettingsPage` with `EsignTemplatesCard` as its child, so the e-sign card sits in the same grid below the Logics and Push settings cards. The router plugin adds the route to `routeTree.gen.ts` on build. |
