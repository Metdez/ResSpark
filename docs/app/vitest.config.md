# `app/vitest.config.ts`

Vitest 5 configuration with three projects (D-21). `pnpm -C app test` runs `web` + `worker-node`; `pnpm -C app test:workerd` runs the Workers-runtime project.

| Lines | What it does |
|-------|--------------|
| 1-3 | Node `path`, the React plugin (JSX in component tests), `defineConfig` from `vitest/config`. |
| 5-7 | Design note: `workerd` is file-referenced because the Cloudflare pool rejects any `environment` other than `node` and inline projects would inherit the React/jsdom root. |
| 8-14 | Root plugins and the `@` alias; inline projects inherit both (`extends: true`). |
| 17-25 | `web` project: jsdom, every `src/**/*.test.{ts,tsx}` plus `shared/**/*.test.ts` (Plan 07-08: the shared question module's own tests), setup file `src/test-setup.ts`. |
| 26-34 | `worker-node` project: plain node, `worker/**/*.test.ts` minus `worker/test/workerd/**` (those need the Workers runtime). Worker handlers run through Hono's `app.request()` with a mock `Env`. |
| 35 | `./worker/vitest.config.ts` — the `workerd` project (`@cloudflare/vitest-plugin`), see `docs/app/worker/vitest.config.md`. |

## Notes

- `test:live` in `package.json` runs the same `worker-node` project with env files injected via `dotenv-cli` for the RLS probe (Plan 04).
- `jsdom` is pinned to 29.0.1 because 30.x requires Node `^24.15.0` and the machine runs 24.14 (`engine-strict`).
- Spike (a) PASSED on 2026-10-11 (Vitest 5.0.3 + plugin 1.4.0), which is why the `workerd` project exists.
