# Vendored files from satnaing/shadcn-admin

Files under `app/` that are **byte-identical** to `satnaing/shadcn-admin@e16c87f213a5ba5e45964e9b67c792105ec74d26`
(MIT, see `app/LICENSES.md`). Per CONTEXT D-23 and the CLAUDE.md "skip vendored" rule they share this
one index instead of a companion doc each. The first time one of them is materially edited it leaves
this table and gets its own `docs/app/<mirrored path>.md`.

`src/components/ui/**` is additionally excluded from the 500-line gate (`app/scripts/check-file-sizes.mjs`);
`sidebar.tsx` is 728 lines and is never split in Phase 1 (RESEARCH A-3).

Regenerate the table with the classification used in Plan 01-02: walk `app/` (skipping `node_modules`,
`dist`, `scripts`), compare each file byte-for-byte with the clone at the commit above.

## Byte-identical (102 files)

| Path (under `app/`) | Origin commit |
|------|---------------|
| `.prettierignore` | `e16c87f` |
| `.prettierrc` | `e16c87f` |
| `components.json` | `e16c87f` |
| `public/images/favicon.png` | `e16c87f` |
| `public/images/favicon.svg` | `e16c87f` |
| `public/images/favicon_light.png` | `e16c87f` |
| `public/images/favicon_light.svg` | `e16c87f` |
| `src/assets/brand-icons/icon-discord.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-docker.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-facebook.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-figma.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-github.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-gitlab.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-gmail.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-medium.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-notion.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-skype.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-slack.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-stripe.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-telegram.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-trello.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-whatsapp.tsx` | `e16c87f` |
| `src/assets/brand-icons/icon-zoom.tsx` | `e16c87f` |
| `src/assets/brand-icons/index.ts` | `e16c87f` |
| `src/assets/custom/icon-dir.tsx` | `e16c87f` |
| `src/assets/custom/icon-layout-compact.tsx` | `e16c87f` |
| `src/assets/custom/icon-layout-default.tsx` | `e16c87f` |
| `src/assets/custom/icon-layout-full.tsx` | `e16c87f` |
| `src/assets/custom/icon-sidebar-floating.tsx` | `e16c87f` |
| `src/assets/custom/icon-sidebar-inset.tsx` | `e16c87f` |
| `src/assets/custom/icon-sidebar-sidebar.tsx` | `e16c87f` |
| `src/assets/custom/icon-theme-dark.tsx` | `e16c87f` |
| `src/assets/custom/icon-theme-light.tsx` | `e16c87f` |
| `src/assets/custom/icon-theme-system.tsx` | `e16c87f` |
| `src/assets/logo.tsx` | `e16c87f` |
| `src/components/confirm-dialog.tsx` | `e16c87f` |
| `src/components/data-table/bulk-actions.tsx` | `e16c87f` |
| `src/components/data-table/column-header.tsx` | `e16c87f` |
| `src/components/data-table/faceted-filter.tsx` | `e16c87f` |
| `src/components/data-table/index.ts` | `e16c87f` |
| `src/components/data-table/pagination.tsx` | `e16c87f` |
| `src/components/data-table/toolbar.tsx` | `e16c87f` |
| `src/components/data-table/view-options.tsx` | `e16c87f` |
| `src/components/date-picker.tsx` | `e16c87f` |
| `src/components/layout/authenticated-layout.tsx` | `e16c87f` |
| `src/components/layout/header.tsx` | `e16c87f` |
| `src/components/layout/main.tsx` | `e16c87f` |
| `src/components/layout/nav-group.tsx` | `e16c87f` |
| `src/components/long-text.tsx` | `e16c87f` |
| `src/components/navigation-progress.tsx` | `e16c87f` |
| `src/components/password-input.tsx` | `e16c87f` |
| `src/components/select-dropdown.tsx` | `e16c87f` |
| `src/components/skip-to-main.tsx` | `e16c87f` |
| `src/components/ui/alert-dialog.tsx` | `e16c87f` |
| `src/components/ui/alert.tsx` | `e16c87f` |
| `src/components/ui/avatar.tsx` | `e16c87f` |
| `src/components/ui/badge.tsx` | `e16c87f` |
| `src/components/ui/button.tsx` | `e16c87f` |
| `src/components/ui/calendar.tsx` | `e16c87f` |
| `src/components/ui/card.tsx` | `e16c87f` |
| `src/components/ui/checkbox.tsx` | `e16c87f` |
| `src/components/ui/collapsible.tsx` | `e16c87f` |
| `src/components/ui/command.tsx` | `e16c87f` |
| `src/components/ui/dialog.tsx` | `e16c87f` |
| `src/components/ui/dropdown-menu.tsx` | `e16c87f` |
| `src/components/ui/form.tsx` | `e16c87f` |
| `src/components/ui/input-otp.tsx` | `e16c87f` |
| `src/components/ui/input.tsx` | `e16c87f` |
| `src/components/ui/label.tsx` | `e16c87f` |
| `src/components/ui/popover.tsx` | `e16c87f` |
| `src/components/ui/radio-group.tsx` | `e16c87f` |
| `src/components/ui/scroll-area.tsx` | `e16c87f` |
| `src/components/ui/select.tsx` | `e16c87f` |
| `src/components/ui/separator.tsx` | `e16c87f` |
| `src/components/ui/sheet.tsx` | `e16c87f` |
| `src/components/ui/sidebar.tsx` | `e16c87f` |
| `src/components/ui/skeleton.tsx` | `e16c87f` |
| `src/components/ui/sonner.tsx` | `e16c87f` |
| `src/components/ui/switch.tsx` | `e16c87f` |
| `src/components/ui/table.tsx` | `e16c87f` |
| `src/components/ui/tabs.tsx` | `e16c87f` |
| `src/components/ui/textarea.tsx` | `e16c87f` |
| `src/components/ui/tooltip.tsx` | `e16c87f` |
| `src/context/direction-provider.tsx` | `e16c87f` |
| `src/context/layout-provider.tsx` | `e16c87f` |
| `src/context/search-provider.tsx` | `e16c87f` |
| `src/features/settings/appearance/index.tsx` | `e16c87f` |
| `src/features/settings/components/sidebar-nav.tsx` | `e16c87f` |
| `src/hooks/use-dialog-state.tsx` | `e16c87f` |
| `src/hooks/use-mobile.tsx` | `e16c87f` |
| `src/hooks/use-table-url-state.ts` | `e16c87f` |
| `src/lib/cookies.test.ts` | `e16c87f` |
| `src/lib/cookies.ts` | `e16c87f` |
| `src/lib/show-submitted-data.tsx` | `e16c87f` |
| `src/lib/utils.ts` | `e16c87f` |
| `src/routes/__root.tsx` | `e16c87f` |
| `src/stores/auth-store.test.ts` | `e16c87f` |
| `src/stores/auth-store.ts` | `e16c87f` |
| `src/tanstack-table.d.ts` | `e16c87f` |
| `src/test-utils/cookies.ts` | `e16c87f` |
| `tsconfig.app.json` | `e16c87f` |
| `tsconfig.json` | `e16c87f` |

## Near-vendored (one-line edits, listed here instead of a companion doc)

| Path (under `app/`) | The only change |
|------|-----------------|
| `src/components/sign-out-dialog.tsx` | redirect target `/sign-in` -> `/admin/sign-in` |
| `src/features/errors/forbidden.tsx` | `navigate({ to: '/' })` -> `/admin`; typography sweep (UI-SPEC: two weights): `font-bold` -> `font-semibold`, `font-medium` removed |
| `src/features/errors/general-error.tsx` | `navigate({ to: '/' })` -> `/admin`; typography sweep (UI-SPEC: two weights): `font-bold` -> `font-semibold`, `font-medium` removed |
| `src/features/errors/maintenance-error.tsx` | typography sweep (UI-SPEC: two weights): `font-bold` -> `font-semibold`, `font-medium` removed |
| `src/features/errors/not-found-error.tsx` | `navigate({ to: '/' })` -> `/admin`; typography sweep (UI-SPEC: two weights): `font-bold` -> `font-semibold`, `font-medium` removed |
| `src/features/errors/unauthorized-error.tsx` | `navigate({ to: '/' })` -> `/admin`; typography sweep (UI-SPEC: two weights): `font-bold` -> `font-semibold`, `font-medium` removed |
| `src/features/auth/sign-in/components/user-auth-form.tsx` | removed the `Forgot password?` `Link` (route no longer exists) and its import; default landing `/` -> `/admin`. Plan 06 rewrites this file against Supabase Auth. |
| `src/features/auth/auth-layout.tsx` | title text `Shadcn Admin` -> `import.meta.env.VITE_APP_NAME ?? 'ResSpark'` with the Heading classes `text-xl font-semibold leading-tight` |
| `src/features/settings/components/content-section.tsx` | section title classes `text-lg font-medium` -> Heading `text-xl font-semibold leading-tight` |
| `src/components/layout/top-nav.tsx` | typography sweep (UI-SPEC: two weights): `font-bold` -> `font-semibold`, `font-medium` removed (unused in Phase 1) |
| `src/components/search.tsx` | typography sweep (UI-SPEC: two weights): `font-bold` -> `font-semibold`, `font-medium` removed on the `kbd` hint |
| `src/components/theme-switch.tsx` | removed the **System** menu item (UI-SPEC A-4: light/dark only) |
| `src/components/command-menu.tsx` | removed the **System** theme command and the `Laptop` icon import |
| `index.html` | removed the Google Fonts `preconnect`/stylesheet links (A-3), the shadcn Open Graph/Twitter tags, and retitled to `ResSpark` with `robots: noindex`; favicons unchanged |
| `src/vite-env.d.ts` | added `interface ImportMetaEnv { readonly VITE_APP_NAME?: string }` so `import.meta.env.VITE_APP_NAME` is typed |
| `tsconfig.node.json` | `include` gained `vitest.config.ts` |
| `src/lib/utils.test.ts` | added a `cn` test (see `docs/app/src/lib/utils.md`) |

## Generated (not documented, excluded from lint and the size gate)

| Path | Generator |
|------|-----------|
| `src/routeTree.gen.ts` | `@tanstack/router-plugin` on every `vite build` / `vite dev`; committed so `tsc -b` runs without a prior build |
