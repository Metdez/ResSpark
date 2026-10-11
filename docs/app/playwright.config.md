# `app/playwright.config.ts`

Playwright configuration for the phone tap-budget test (Plan 06-06, D-14, SIGN-04). Run it with `pnpm -C app test:e2e`.

- `testDir: 'e2e'`: specs live in `app/e2e/*.spec.ts`. Vitest's include globs (`src/**/*.test.*`, `worker/**/*.test.ts`) never match that folder, so `pnpm test` and `pnpm check` do not pick the specs up (RESEARCH Pitfall 12).
- `reporter: 'list'`: one line per test in the terminal; no HTML report folder.
- `use.baseURL`: `http://localhost:5179`, so specs call `page.goto('/c/')`.
- One project, `chromium-390x844`: Chromium with a `390 × 844` viewport, `isMobile: true`, `hasTouch: true`, `deviceScaleFactor: 3`. This is CONTEXT's phone size; Playwright's `iPhone 13` descriptor is 390 × 664 and defaults to WebKit (RESEARCH contradiction 8). Only Chromium is installed (`pnpm -C app exec playwright install chromium`).
- `webServer`: `pnpm exec vite --port 5179 --strictPort`, waits for `http://localhost:5179/c/` (up to 120 s), and reuses a server already on that port. The Vite dev server with the Cloudflare plugin (the dev Worker) served every run in Plan 06-06, so no preview build was needed.
- Every `/api/c/*` call and DocuSeal's `form.js` are answered inside the browser by `e2e/portal-mock.ts`, so no env file, database, or DocuSeal key is needed.
- The Worker skips the CSP on `localhost`, so this run never sees the client CSP; the CSP is proven by `worker/src/middleware/client-csp.test.ts` and the deployed smoke check.

`tsconfig.node.json` includes this file and `e2e/**/*.ts` (with the `DOM` lib for the `page.evaluate` callbacks), so `tsc -b` type-checks them.
