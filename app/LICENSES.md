# Third-party licenses

## satnaing/shadcn-admin (MIT)

`app/` started as a copy of <https://github.com/satnaing/shadcn-admin> at commit
`e16c87f213a5ba5e45964e9b67c792105ec74d26` (cloned 2026-10-11, Phase 1 Plan 02, decision D-03).
The copied files keep this license; `docs/app/src/VENDORED.md` lists which of them are still
byte-identical to that commit.

```
MIT License

Copyright (c) 2024 Sat Naing

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Copied from the fork

- Root: `index.html`, `components.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`,
  `eslint.config.js`, `vite.config.ts`, `.prettierrc`, `.prettierignore`, `public/`
- `src/main.tsx`, `src/vite-env.d.ts`, `src/tanstack-table.d.ts`, `src/routes/__root.tsx`
- `src/components/` (`ui/`, `layout/`, `data-table/`, and the root composites), `src/hooks/`,
  `src/lib/`, `src/stores/`, `src/context/`, `src/config/`, `src/styles/`, `src/test-utils/cookies.ts`
- `src/assets/` (brand icons, custom icons, `logo.tsx`)
- `src/features/auth/auth-layout.tsx`, `src/features/auth/sign-in/`, `src/features/dashboard/index.tsx`,
  `src/features/errors/`, `src/features/settings/` (index, `components/`, `appearance/`)
- `package.json` dependency list (versions pinned to what the fork's lockfile resolved at that commit)

### Not copied / deleted

- Clerk: `src/routes/clerk/**`, `src/assets/clerk-logo.tsx`, `src/assets/clerk-full-logo.tsx`,
  the `@clerk/react` dependency and the `VITE_CLERK_PUBLISHABLE_KEY` env line
- Demo features: `src/features/{apps,chats,tasks,users}/**` and their routes (the only `@faker-js/faker` users)
- `axios` usage in `src/main.tsx` and `src/lib/handle-server-error.ts`; the `axios` dependency
- `recharts` and `src/features/dashboard/components/**` (metrics, overview, recent sales, analytics)
- Demo composites: `components/config-drawer.tsx`, `components/coming-soon.tsx`, `components/learn-more.tsx`,
  `components/layout/team-switcher.tsx`
- Other auth pages and routes: `(auth)/{sign-up,forgot-password,otp,sign-in-2}`, `(errors)/*`,
  `_authenticated/{help-center,errors}`, settings `account/display/notifications/profile`
- Browser-mode test tooling and the tests that need it: `@vitest/browser-playwright`, `@vitest/coverage-v8`,
  `@vitest/ui`, `vitest-browser-react`, `playwright`, every `*.test.tsx` importing `vitest-browser-react`,
  `src/test-utils/tanstack-table.ts`, `knip` + `knip.config.ts`
- Repo plumbing: `.git/`, `.github/`, `.vscode/`, `pnpm-lock.yaml`, `netlify.toml`, `cz.yaml`,
  `CHANGELOG.md`, `README.md`, `LICENSE` (text reproduced above)

## Runtime dependencies with attribution notes

- `@cantoo/pdf-lib` 2.11.1 (MIT), <https://github.com/cantoo-scribe/pdf-lib>, a maintained fork of
  Hopding/pdf-lib. Used by `worker/src/pdf/` to split PDFs and wrap JPEG/PNG images before they
  are pushed to Logics (Phase 5, PUSH-02). Its license ships in `node_modules/@cantoo/pdf-lib/LICENSE.md`.
- `heic2any` 0.0.4 (MIT), <https://github.com/alexcorvi/heic2any>. Converts iPhone HEIC photos to
  JPEG in the client upload step (Phase 3, UPL-02). Loaded with a dynamic `import()` only when a
  HEIC file is picked, so it stays out of the `/c/*` entry chunk.
- `tus-js-client` 4.3.1 (MIT), <https://github.com/tus/tus-js-client>. Resumable uploads from the
  client upload step to Supabase Storage (Phase 3, UPL-01). Loaded with a dynamic `import()`.
  Both verified with `pnpm view <pkg>@<ver> version license` on 2026-10-11.
- `@docuseal/react` 1.0.75 (MIT), <https://github.com/docusealco/docuseal-react>. DocuSeal's embedded
  signing form for the client's signing page (Phase 6, SIGN-04). Loaded with a dynamic `import()` only
  on `/c/sign/$itemId`, so it stays out of the `/c/*` entry chunk. It loads DocuSeal's `form.js` from
  `cdn.docuseal.com` at runtime; that script is not redistributed here. Verified with `pnpm view` on 2026-10-11.
- `@playwright/test` 1.63.0 (Apache-2.0), <https://github.com/microsoft/playwright>. Dev dependency for the
  390x844 tap-budget test in `app/e2e/` (Phase 6, SIGN-04); not shipped. Verified with `pnpm view` on 2026-10-11.

## Visual references (no code copied)

ERPNext (GPL-3.0), DocuSeal (AGPL-3.0), Gather (AGPL-3.0), and Bigcapital (AGPL-3.0) inform layout
and density only. No source from them is in this repository.
