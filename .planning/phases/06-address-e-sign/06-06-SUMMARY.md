---
phase: 06-address-e-sign
plan: 06
subsystem: client-portal
tags: [e-sign, docuseal, playwright, csp, deep-link, mobile]
status: complete
requires: [06-02, 06-03]
provides: ["/c/sign/$itemId signing route", "DocusealEmbed (lazy @docuseal/react)", "GET /c/:token?step=<uuid> deep link", "client CSP DocuSeal hosts", "Playwright 390x844 tap-budget gate"]
affects: [06-07, 06-08]
tech-stack:
  added: ["@docuseal/react 1.0.75 (MIT, runtime, lazy)", "@playwright/test 1.63.0 (Apache-2.0, dev, Chromium only)"]
  patterns: ["React.lazy over a named export", "adjust-state-during-render for a one-shot auto-open", "fixed sonner toast id against StrictMode double effects"]
key-files:
  created:
    - app/src/features/client-portal/sign/sign-api.ts
    - app/src/features/client-portal/sign/sign-copy.ts
    - app/src/features/client-portal/sign/sign-page.tsx
    - app/src/features/client-portal/sign/docuseal-embed.tsx
    - app/src/routes/c/sign.$itemId.tsx
    - app/playwright.config.ts
    - app/e2e/fake-docuseal-form.ts
    - app/e2e/portal-mock.ts
    - app/e2e/sign-taps.spec.ts
  modified:
    - app/src/features/client-portal/step-list.tsx
    - app/src/features/client-portal/portal-page.tsx
    - app/src/features/client-portal/connect/consent-sheet.tsx
    - app/src/features/client-portal/connect/connection-api.ts
    - app/src/routes/c/index.tsx
    - app/src/routeTree.gen.ts
    - app/worker/src/routes/client-link.ts
    - app/worker/src/middleware/client-csp.ts
    - app/package.json
    - app/tsconfig.node.json
    - app/LICENSES.md
    - .gitignore
decisions:
  - "Signature row button reads `Sign` (not `Review and sign`); submitted/approved signatures read `View` and still open the signing page, which shows the already-signed message"
  - "Deep-linked signature auto-open navigates with replace: true so browser Back cannot loop into /c/?step=; sheets ask the parent to clear step instead"
  - "409 bad_template and item_approved map to the not-set-up and already-signed screens"
  - "sign-page.test.tsx uses the real @docuseal/react (jsdom never loads form.js) instead of a mock, so the data-* attribute names are tested for real"
metrics:
  duration: 48m
  completed: 2026-10-11
actuals:
  tokens: 17500
  tasks: 3
  commits: 3
  commits_range_total: 20
plan_head_before: e7922775b8fe0f7ce5a5ca1d836aa889d9f4dd5d
plan_head_after: ef853d577c7822f76580ed085eab74885e4a92a6
---

# Phase 6 Plan 06: Client Signing on a Phone Summary

The signature row's `Sign` opens a full-bleed `/c/sign/$itemId` page that asks for ESIGN consent once, then shows DocuSeal's lazy-loaded embed (resubmit and send-copy off, 16 px inputs forced through `customCss`). A copied `/c/<token>?step=<uuid>` link deep-links there after `Start`, and the `/c/*` CSP admits DocuSeal's script, fetch, and font hosts. Playwright at 390×844 proves 3 taps from a fresh link and 2 from a copied link.

## Commits

| Task | Commit | What |
|---|---|---|
| 1 | 7cfb90c | Sign row, signing page, consent sheet points, lazy embed, search params, route tree, docs |
| 2 | 8926c10 | `step` forward in the link exchange, DocuSeal CSP hosts, tests, docs |
| 3 | ef853d5 | Playwright config, fake form.js, API mock, 7 specs, toast dedupe fix, docs |

`commits: 3` counts this plan's commits. `git rev-list --count plan_head_before..HEAD` gives 20, because other executors committed on `zack` in the same window.

## Facts the plan asked to record

- **`data-*` attributes `@docuseal/react` 1.0.75 renders** (read from `dist/index.esm.js`): `data-src`, `data-with-title`, `data-only-required-fields`, `data-with-send-copy-button`, `data-send-copy-email`, `data-allow-to-resubmit`, `data-language`, `data-expand`, `data-go-to-last`, `data-allow-typed-signature`, `data-custom-css`, and others. Booleans render as `"true"` / `"false"`.
- **Tap counts:** fresh link 3 (`Start`, `Sign`, `I agree`). Copied link 2 (`Start`, `I agree`). No sideways scroll after any tap.
- **e2e server:** the Vite dev server with the Cloudflare plugin (dev Worker) served every run. No preview build was needed. 7 of 7 passed.
- **Chunk sizes** (`pnpm build`): the entry `index-*.js` is 209,108 B and contains no `docuseal`. The DocuSeal wrapper chunk `index.esm-*.js` is 3,129 B, and the sign route chunk is 4,309 B.
- **React 19:** no adaptation needed. The wrapper renders under React 19.2, so RESEARCH assumption A5 holds.
- **Viewport meta:** unchanged (`width=device-width, initial-scale=1.0`, no `maximum-scale`).

## Verification

- `vitest --project web src/features/client-portal`: 15 files and 156 tests, all passing. Within that, `sign-page.test.tsx` has 15 tests and `sign-api.test.ts` has 8.
- `vitest --project worker-node` on client-link, client-csp, and logger: 29 passed.
- `pnpm test:e2e`: 7 passed. `pnpm build` passed, and the entry-chunk check passed.
- `pnpm run check`: 142 files and 1756 tests passed (29 files skipped, live suites). There were 0 lint errors; 7 pre-existing `react-refresh` warnings are in files this plan did not touch.
- The plan greps passed: no forbidden imports and no `text-sm`/`text-xs` under `sign/`. `@docuseal/react` is imported by exactly one non-test file, and the `frame-src` count is unchanged at 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The "Signed" toast showed twice.**
- **Found during:** Task 3 (Playwright completion spec)
- **Issue:** React StrictMode runs the portal page's `signed` effect twice in dev, which produced two identical toasts.
- **Fix:** added `toast.success(..., { id: 'signed' })` so sonner dedupes it, and updated the unit test.
- **Files:** `app/src/features/client-portal/portal-page.tsx`, `portal-page.test.tsx`
- **Commit:** ef853d5

**2. [Rule 3 - Blocking] Lint rule `react-hooks/set-state-in-effect`.**
- **Found during:** Task 1
- **Issue:** opening the auto-open sheet inside an effect broke the lint rule.
- **Fix:** the sheet now opens during render (React's adjust-state pattern). An effect guarded by a ref runs `onView`, the navigation, and `onAutoOpened`.
- **Commit:** 7cfb90c

### Other adjustments

- `sign-page.test.tsx` renders the real `@docuseal/react` instead of a mock, since jsdom never fetches `form.js`.
- The router `to` paths are `/c`, not `/c/`, to match the generated route types (`return-page.tsx` does the same). The completion URL check accepts both.
- `tsconfig.node.json` gains the `DOM` libs so the e2e `page.evaluate` callbacks type-check.
- `.gitignore` gains `test-results/` and `playwright-report/`.
- Doc files for the new test files (`sign-api.test.md`, `sign-page.test.md`) were added beyond the plan's list, per the CLAUDE.md doc rule.
- In Task 1, `app/package.json` was staged hunk-only so 04-07's then-uncommitted `smoke:connect` hunk stayed out of the commit. 04-07 committed that hunk itself later.

## Known Stubs

None.

## Threat Flags

None. The new surface (the `step` query, the third-party `form.js`, and `embed_src` rendering) is covered by T-06-23 through T-06-26 and mitigated as planned.

## Held out

- Real iPhone Safari and Android Chrome checks, including the real DocuSeal form and the deployed CSP (`securitypolicyviolation`), belong to Plan 06-08 as human checks. The localhost CSP skip means Playwright never sees the header.
- SIGN-03 and SIGN-04 are not marked complete, because unfinished plans 06-07 and 06-08 also declare them.

## Self-Check: PASSED

All 9 created files exist, and commits 7cfb90c, 8926c10, and ef853d5 are ancestors of HEAD.
