# `app/worker/test/workerd/config.test.ts`

Spike (a) proof: the deployed Worker code running inside workerd through `@cloudflare/vitest-plugin`. Run with `pnpm -C app test:workerd`.

| Lines | What it does |
|-------|--------------|
| 1-2 | `SELF` (a fetcher for the Worker under test, configured from `wrangler.jsonc`) from `cloudflare:test`; Vitest. |
| 5-11 | `SELF.fetch('http://x/api/config')` → 200 and a body containing `app_env: 'sandbox'` — the var comes from the real `wrangler.jsonc`, not a mock. |

## Notes

- Spike (a) result: PASS (Vitest 5.0.3 + plugin 1.4.0, 4.1 s cold). Recorded in `01-03-SUMMARY.md`.
- Keep this project small; the fast `worker-node` lane covers behaviour, this lane covers runtime integration.
