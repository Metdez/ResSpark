# `app/eslint.config.js`

ESLint flat config inherited from shadcn-admin; only the `ignores` list changed. Run with `pnpm -C app lint`.

| Lines | What it does |
|-------|--------------|
| 1-7 | Plugins: browser globals, `@eslint/js`, TanStack Query rules, React Hooks, React Refresh, typescript-eslint. |
| 9-18 | Ignored paths: build output, vendored `src/components/ui`, the generated `src/routeTree.gen.ts`, wrangler's `worker-configuration.d.ts` (Plan 03), and `.wrangler/`. |
| 19-25 | Base rule sets applied to `**/*.{ts,tsx}`: JS recommended, TS recommended, Query `flat/recommended`. |
| 26-66 | Rules: hooks recommended, refresh-only-exports as a warning, `no-console: error`, unused vars allowed with a `_` prefix, inline `type` imports enforced, duplicate imports forbidden. |

## Notes

- `.mjs` files under `scripts/` match no rule block, so `eslint .` reports nothing for them.
- Route files export a `Route` constant; `react-refresh/only-export-components` warns (not errors) on them, same as the fork.
