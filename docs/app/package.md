# `app/package.json`

The app's npm manifest (pnpm workspace member `app`; the lockfile is `pnpm-lock.yaml` at the repo root). Every dependency is pinned to an exact version, without carets, so installs are reproducible and the lockfile's integrity hashes are the supply-chain record.

## Scripts

| Script | What it runs |
|---|---|
| `dev` | Vite dev server with the Worker (Cloudflare Vite plugin) |
| `build` | `tsc -b`, then `vite build` (SPA into `dist/client`, Worker beside it) |
| `preview` | `vite preview` of the build |
| `lint`, `format`, `format:check` | ESLint and Prettier |
| `test` | Vitest `web` (jsdom) and `worker-node` projects |
| `test:workerd` | Vitest in workerd |
| `test:e2e` | Playwright (`playwright.config.ts`, specs in `e2e/`); every API call is mocked, so it needs no env file |
| `test:live`, `test:live:file`, `test:rls`, `test:requests` | Opt-in tests against live services, with env files loaded by `dotenv-cli` |
| `check` | file-size check, golden-fixture check, `tsc -b`, ESLint, `pnpm test` |
| `cf-typegen`, `wrangler`, `deploy:raw`, `deploy` | Wrangler types and deploys |
| `smoke`, `smoke:auth` | Deployed smoke checks |
| `db:migrate`, `questions:reconcile`, `secrets:*`, `staff:create`, `auth:config-push`, `spike` | Operational scripts under `scripts/` |

## Dependencies added in Phase 6 Plan 06

| Package | Version | License | Kind | Why |
|---|---|---|---|---|
| `@docuseal/react` | 1.0.75 | MIT | runtime | DocuSeal's embedded signing form (`DocusealForm`), lazy-loaded only by `src/features/client-portal/sign/docuseal-embed.tsx`. Approved in 06-RESEARCH's Package Legitimacy Audit (no postinstall) |
| `@playwright/test` | 1.63.0 | Apache-2.0 | dev | The 390×844 tap-budget test (`e2e/sign-taps.spec.ts`). Pinned to 1.63.0 because 1.64.0 was flagged too new in the audit. Browsers: Chromium only |

Both verified with `pnpm view <pkg>@<version> version license` (2026-10-11) and recorded in `app/LICENSES.md`.
