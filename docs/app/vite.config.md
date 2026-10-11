# `app/vite.config.ts`

Vite configuration for the SPA and the Worker. The fork's Vitest browser-mode `test` block was removed; tests live
in `app/vitest.config.ts`.

| Lines | What it does |
|-------|--------------|
| 1-6 | Node `path`, Vite `defineConfig`, the React, Tailwind 4, TanStack Router, and Cloudflare plugins. |
| 8-9 | `cloudflare()` must stay last so the Worker builds after the framework plugins. |
| 10-19 | Plugin order: router plugin first (generates `src/routeTree.gen.ts`, splits every route file with `autoCodeSplitting`), then React, Tailwind, and `cloudflare()`, which reads `wrangler.jsonc`, runs `worker/src/index.ts` in workerd during `vite dev`, and on build emits `dist/client` (assets), `dist/resspark/index.js` (Worker), and the output `dist/resspark/wrangler.json` that `wrangler deploy` uses. |
| 20-24 | `@` alias to `./src`, matching `tsconfig.*.json` `paths` and `components.json`. |

## Notes

- `pnpm -C app dev` serves SPA and API on one origin (port 5173); `pnpm -C app build` = `tsc -b && vite build`.

- `autoCodeSplitting: true` is what keeps the future `/c/*` bundle free of the admin shell as long as `routes/c/**` never imports `@/components/layout` (D-04).
- `__dirname` is available because Vite bundles the config before evaluating it.
