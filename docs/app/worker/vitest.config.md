# `app/worker/vitest.config.ts`

The `workerd` Vitest project: runs tests inside the real Workers runtime through `@cloudflare/vitest-plugin` 1.4.0 (spike (a), D-21/D-22a — PASS with Vitest 5.0.3). Referenced by file from `app/vitest.config.ts` so the Workers pool never inherits the root React/jsdom setup.

| Lines | What it does |
|-------|--------------|
| 1-2 | `cloudflareTest` plugin and `defineProject`. |
| 4 | Why it is a separate file: the Workers pool rejects any `environment` other than `node`, and inline projects inherit root plugins. |
| 5-8 | The project: `cloudflareTest` reads `../wrangler.jsonc` (bindings, vars, `nodejs_compat`); name `workerd`; only `test/workerd/**/*.test.ts` run here. |

## Notes

- Run with `pnpm -C app test:workerd`. The default `pnpm -C app test` runs only `web` + `worker-node`, so `check` stays fast; the `worker-node` project excludes `worker/test/workerd/**` so these files never run under plain node.
- Tests import `{ SELF, env, fetchMock } from 'cloudflare:test'`; the types come from `@cloudflare/vitest-plugin/types` in `app/worker/tsconfig.json`.
- Unit-level Worker logic (guard, logger, routing) stays in `worker-node` via `app.request()`; use `workerd` only for runtime-specific behaviour (bindings, `nodejs_compat` APIs, queues).
