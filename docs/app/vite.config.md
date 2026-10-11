# `app/vite.config.ts`

Vite configuration for the SPA. The fork's Vitest browser-mode `test` block was removed; tests live
in `app/vitest.config.ts`.

| Lines | What it does |
|-------|--------------|
| 1-5 | Node `path`, Vite `defineConfig`, the React, Tailwind 4, and TanStack Router plugins. |
| 7-8 | Where Plan 03 appends `cloudflare()` (must stay last) so the Worker builds with the SPA. |
| 10-17 | Plugin order: router plugin first (generates `src/routeTree.gen.ts`, splits every route file with `autoCodeSplitting`), then React, then Tailwind. |
| 18-22 | `@` alias to `./src`, matching `tsconfig.*.json` `paths` and `components.json`. |

## Notes

- `autoCodeSplitting: true` is what keeps the future `/c/*` bundle free of the admin shell as long as `routes/c/**` never imports `@/components/layout` (D-04).
- `__dirname` is available because Vite bundles the config before evaluating it.
