# `app/vitest.config.ts`

Vitest 5 configuration with two inline projects (D-21). Run with `pnpm -C app test`
(`vitest run --project web --project worker-node`).

| Lines | What it does |
|-------|--------------|
| 1-3 | Node `path`, the React plugin (JSX in component tests), `defineConfig` from `vitest/config`. |
| 5-7 | Design note: `workerd` (Cloudflare pool) is added by Plan 03 as a file-referenced project because that pool rejects any `environment` other than `node`. |
| 9-14 | Root plugins and the `@` alias; inline projects inherit both (`extends: true`). |
| 16-25 | `web` project: jsdom, every `src/**/*.test.{ts,tsx}`, setup file `src/test-setup.ts`. |
| 26-33 | `worker-node` project: plain node, `worker/**/*.test.ts` (empty until Plan 03; Vitest tolerates an empty project when another project has files). |

## Notes

- `test:live` in `package.json` runs the same `worker-node` project with env files injected via `dotenv-cli` for the RLS probe (Plan 04).
- `jsdom` is pinned to 29.0.1 because 30.x requires Node `^24.15.0` and the machine runs 24.14 (`engine-strict`).
