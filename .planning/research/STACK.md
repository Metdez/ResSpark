# Technology Stack

**Project:** ResSpark (two-sided tax-resolution document-collection platform)
**Domain:** Staff admin portal + no-account mobile client portal, integrating IRS Logics, Plaid/Teller, Truv, DocuSeal, Smarty, Supabase, Cloudflare, OpenRouter
**Researched:** 2026-10-10
**Mode:** Ecosystem (brownfield milestone; existing Python engine and vanilla TS frontend are not re-researched)
**Overall confidence:** HIGH on versions and platform limits (read from npm registry and Cloudflare/Supabase docs today); MEDIUM on three items flagged "spike first" (Vitest 5 + Workers plugin, `@supabase/server` on Workers, Cloudflare Email Service).

All versions below were read from the npm registry on 2026-10-10 unless marked otherwise. Platform limits were scraped from developers.cloudflare.com on the same day.

---

## Decisions at a glance (the six questions)

| # | Question | Decision | Confidence |
|---|----------|----------|------------|
| 1 | Admin shell | **Fork `satnaing/shadcn-admin`** (15.7k stars, MIT, last push 2026-09-10). React 19 + Vite 8 + Tailwind 4 + shadcn/ui + TanStack Router/Query/Table. Strip Clerk, axios, faker demo data. | HIGH |
| 2 | API on Cloudflare | **One Worker: Hono 4.13 + static assets** (SPA via `assets` binding, built with `@cloudflare/vite-plugin`). Supabase via `@supabase/supabase-js` 2.117.3 (works on Workers, official Cloudflare doc page exists). Staff JWT verified with `@supabase/server` Hono adapter (JWKS, no `jose` boilerplate). | HIGH (supabase-js), MEDIUM (`@supabase/server`) |
| 3 | 433-A engine | **Port to TypeScript**, guarded by golden-fixture parity tests generated from the existing Python. Do not run Python on Workers. | HIGH |
| 4 | PDFs | **`@cantoo/pdf-lib` 2.11.1** for split/merge/image-to-PDF, **`unpdf` 1.8.1** for text extraction, both inside the Queue consumer on **Workers Paid**. Avoid `mupdf` (AGPL). | MEDIUM-HIGH |
| 5 | Jobs | **Cloudflare Queues (1 queue + 1 DLQ) + a 15-minute Cron Trigger.** Skip Durable Objects and Workflows for v1. | HIGH |
| 6 | Tests | **Vitest 5.0.3** (projects: `web`, `worker`, `engine`) + **`@cloudflare/vitest-plugin` 1.4.0** (the renamed `vitest-pool-workers`) + **Playwright 1.64.0** with mobile device projects + Supabase pgTAP for RLS. | MEDIUM-HIGH |

Two facts that change the plan, discovered during verification:

1. **`@cloudflare/vitest-pool-workers` was renamed to `@cloudflare/vitest-plugin` (v1.x, Aug 2026).** The old package (last 0.23.0) peers `vitest ^4.1.0` and fails on Vitest 5. The new package (1.4.0) peers `vitest ^4.1.0 || ^5.0.0`. Do not install the old name.
2. **Supabase is deprecating the `anon` and `service_role` keys by end of 2026.** Use `sb_publishable_...` and `sb_secret_...` keys from day one. `.env.example` and the existing `VITE_SUPABASE_PUBLISHABLE_KEY` already use the new naming for the browser key; the Worker must use `sb_secret_...`.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Node.js | 24.x LTS (local is 24.14.0) | Toolchain | Vitest 5 requires `^22.12 \|\| ^24 \|\| >=26`; `@supabase/supabase-js` requires `>=22`. Existing `engines: ">=18"` must be raised to `>=22.12`. | HIGH |
| TypeScript | **~6.0.3** (pin; NOT 7.0.2) | Language | `latest` on npm is 7.0.2 (native port), but `typescript-eslint` peers `typescript >=4.8.4 <6.1.0`, so TS 7 breaks lint. `satnaing/shadcn-admin` itself pins `~6.0.3`. Revisit TS 7 when typescript-eslint widens its peer. | HIGH |
| React / React DOM | 19.3.0 | UI | shadcn-admin is on React 19; shadcn/ui components target it. | HIGH |
| Vite | 8.3.4 | Dev server + bundler | shadcn-admin uses `^8.0.8`. `@vitejs/plugin-react` 6.x REQUIRES Vite 8. `@cloudflare/vite-plugin` 1.63.1 supports Vite 6/7/8. Existing repo is on Vite 6.4.3; upgrade as part of the rebuild. | HIGH |
| @vitejs/plugin-react | 6.1.2 | React transform | Peer `vite ^8.0.0`. | HIGH |
| Tailwind CSS + `@tailwindcss/vite` | 4.3.3 | Styling | CSS-first v4 config, what shadcn-admin ships. | HIGH |
| shadcn CLI (`shadcn`) | 4.21.4 | Copy-in component generator | Components are copied into the repo (matches the user's "copy components" directive). 125k-star `shadcn-ui/ui`. | HIGH |
| TanStack Router + router-plugin | 1.170.42 / 1.168.43 | File-based routing, two route trees (`/admin/*`, `/c/$token`) | shadcn-admin already uses it; auto code-splitting keeps the client (phone) bundle small by not loading the admin tree. | HIGH |
| TanStack Query | 5.104.1 | Server state, polling for live status | `refetchInterval` polling gives "no manual reload" without Realtime complexity. | HIGH |
| TanStack Table | **8.21.3** (pin v8; npm `latest` is 9.2.8) | Data tables | shadcn-admin and the shadcn data-table recipes are written against v8. v9 is a new major; do not mix. | MEDIUM-HIGH |
| React Hook Form + resolvers + Zod | 7.89.0 / 5.9.1 / 4.6.5 | Forms and validation | The same Zod schemas validate in the browser and in the Worker (shared `packages`/`shared` folder). Intake already has typed validation to port. | HIGH |
| Hono | 4.13.13 | Worker API framework | 32.5k stars, MIT, built for Workers, typed `Bindings`, built-in `jwk`/`secureHeaders`/`cors`, tiny. | HIGH |
| @hono/standard-validator | 0.4.0 | Request validation | What Hono's current validation guide uses (`sValidator('json', zodSchema)`). `@hono/zod-validator` 0.9.1 is the older equivalent. | MEDIUM-HIGH |
| Wrangler | 4.149.0 | Dev, deploy, secrets, types | `@cloudflare/vite-plugin` peers `wrangler ^4.149.0`. Use `wrangler types` to generate `Env` (replaces hand-written interfaces and `@cloudflare/workers-types`). | HIGH |
| @cloudflare/vite-plugin | 1.63.1 | Runs Worker inside Vite dev (workerd), builds SPA + Worker together | Official React + Vite framework guide; one `vite build`, one `wrangler deploy`. | HIGH |
| @supabase/supabase-js | 2.117.3 | Postgres (PostgREST), Auth, Storage, RPC | Already in the repo. Cloudflare publishes an official "Supabase" Workers doc page that uses it directly from `fetch`. | HIGH |
| @supabase/server | 1.9.1 (v1, MIT, updated 2026-10-05) | Verify staff JWT in the Worker, build RLS-scoped and admin clients | Ships `@supabase/server/adapters/hono` (`withSupabase({ auth: 'user' })`), verifies asymmetric-key JWTs via JWKS internally (no `jose`), explicit Workers support. | MEDIUM (new package; spike on Workers first, fallback below) |

### Database and Storage (Supabase, already provisioned)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Supabase Postgres + RLS | managed | System of record for requests, links, events, audit log; IRS standards tables | RLS on every table is a stated constraint. Staff read through the browser client under RLS; the Worker uses the secret-key client for webhook/Logics/client-link work. | HIGH |
| Supabase Auth | managed | Staff sign-in only | Clients never get accounts. Use asymmetric JWT signing keys (default for new projects) so the Worker verifies locally from JWKS. | HIGH |
| Supabase Storage | managed | Client documents, bank-statement PDFs | Private buckets, `allowedMimeTypes` + `fileSizeLimit` per bucket, signed download URLs (short-lived), signed upload URL + TUS resumable endpoint for client uploads. | HIGH |
| Postgres functions (RPC) | n/a | IRS standards lookups for the ported engine | Keep `canonical_state_name()` / `normalize_county_name()` and the six lookup queries in SQL under `src/schemas/`, call via `supabase.rpc(...)`. Preserves "standards live in the database, not in code". | HIGH |
| Supabase CLI | latest | Migrations, `gen types typescript`, local stack, pgTAP | Types: `supabase gen types typescript` then `createClient<Database>()`. | HIGH |

Do NOT add Hyperdrive, Drizzle, or a direct `pg`/`postgres` driver in v1. PostgREST + RPC over HTTPS is enough, works in Workers with no TCP, and keeps RLS semantics identical between browser and server. (`@supabase/server`'s own SQL-over-`pg` path is documented as Node/Deno/Bun only, not Workers.)

### Infrastructure (Cloudflare)

| Technology | Version / Plan | Purpose | Why | Confidence |
|------------|----------------|---------|-----|------------|
| Workers with static assets | `assets` binding, `not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*","/webhooks/*"]` | Serve SPA and API from one deploy | SPA routes (including `/c/<token>`) are served as assets without invoking the Worker (free, fast on phones); API and webhook paths always hit the Worker. Official React + Vite guide pattern. | HIGH |
| **Workers Paid plan** | $5/month | Required | Free plan is 10 ms CPU per request and 10 ms per cron; PDF split/merge, signature verification of large payloads, and Logics uploads need the Paid limits (30 s default, up to 5 min CPU; cron 30 s for sub-hourly). Also unlocks Email Service sending. Budget it; it is the only fixed cost. | HIGH |
| Cloudflare Queues | 1 queue `resspark-jobs` + DLQ `resspark-dlq` | Webhook processing, Logics push, PDF work, reminder sends, retries | Limits (docs, today): 128 KB message, max 100 retries, batch up to 100, delay up to 24 h, retention up to 14 days, consumer wall time 15 min. Paid: 1M ops/month included then $0.40/M. Free plan has 10k ops/day. | HIGH |
| Cron Triggers | `*/15 * * * *` (one trigger, branch on `controller.cron` if more are added) | Scan for due reminders, expiring/expired links, overdue flags, re-enqueue stuck jobs | 250 triggers on Paid; 30 s CPU for sub-hourly interval. | HIGH |
| Workers secrets | `wrangler secret put`, `.dev.vars` locally | Logics, Plaid, Truv, DocuSeal, Smarty, OpenRouter, `sb_secret_...` | No secrets in the SPA bundle; only `VITE_SUPABASE_URL` and the publishable key are browser-visible. | HIGH |
| Compatibility flags | `compatibility_date` = date of first deploy (docs example uses 2026-10-06), `nodejs_compat` | Required by `@supabase/server` and many npm deps on Workers | Official `@supabase/server` README: "Enable `nodejs_compat`" on Workers. | HIGH |
| Cloudflare Email Service | `send_email` binding, Workers Paid only (3,000 emails/month included, then $0.35/1,000) | Send the client link email and reminders | Native binding, no extra vendor. Needs sender-domain DNS (SPF/DKIM). Original announcement was a private beta, current docs show pricing, so confirm onboarding state before the Oct 12 demo. Fallback: Resend over `fetch`. | MEDIUM (spike) |

### Supporting Libraries (frontend)

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| lucide-react | 1.55.0 | Icons | Everywhere (shadcn default). | HIGH |
| sonner | 2.0.8 | Toasts | Staff actions ("Pushed 3 documents to Logics"). | HIGH |
| recharts | 3.10.1 | Charts | Only if the dashboard gets charts; bank/income views are tables first. | MEDIUM |
| date-fns | 4.4.0 | Dates | "Opened 3 min ago", overdue calculations. | HIGH |
| cmdk | 1.1.1 | Command palette | Case lookup by ID/phone/email as a palette (shadcn-admin ships it). | HIGH |
| zustand | 5.0.15 | Small client state | Only for UI state (sidebar, step wizard). Server state stays in TanStack Query. | MEDIUM |
| class-variance-authority / tailwind-merge / tw-animate-css | 0.7.1 / 3.7.0 / 1.4.0 | shadcn plumbing | Pulled in by shadcn. | HIGH |
| react-plaid-link | 5.0.0 | Embedded Plaid Link | When not using `hosted_link`. Hosted Link (SMS/URL) is the primary path per PROJECT.md. | HIGH |
| @docuseal/react | 1.0.75 | `DocusealForm` embedded signing | Client e-sign step. | HIGH |
| @docuseal/api | 1.0.25 (zero dependencies) | `createSubmission` from the Worker | Safe on Workers (no axios). Or plain `fetch`. | HIGH |
| Truv Bridge, Teller Connect | script tags (`cdn.truv.com`, `cdn.teller.io/connect/connect.js`) | Payroll and alternative bank link | No npm package exists for either (404 on the obvious names). Wrap each in a small typed `useScript` hook; add both hosts to CSP. | HIGH |
| tus-js-client | 4.3.1 | Resumable client uploads direct to Supabase Storage TUS endpoint | Meets "resumable on reload". Chunk size MUST be 6 MB per Supabase docs. Worker issues `createSignedUploadUrl`, client sends the token in `x-signature`, so the client needs no Supabase session. | MEDIUM-HIGH (spike the signed-token + TUS combo) |
| browser-image-compression | 2.0.2 | Shrink phone photos before upload | Phone JPEG/HEIC-to-JPEG frequently exceed 6 MB; Workers cannot recompress images cheaply, so do it in the browser. | MEDIUM |
| libphonenumber-js | 1.13.15 | Phone validation/normalisation | Staff "send link" form (E.164, US default). | HIGH |
| (custom 20-line check) | n/a | Typo-domain detection (`gmailcom`, `gmial.com`) | `email-validator` 2.0.4 only checks syntax and would pass `a@gmailcom`. Write a tiny common-domain + edit-distance check; no dependency needed. | HIGH |
| react-dropzone | 20.1.3 (verify) | Desktop drag-drop in admin | Optional. On phones a native `<input type="file" multiple accept="image/*,application/pdf">` already opens camera/camera roll; skip the library on `/c/*`. | LOW (verify version/API on install) |

### Supporting Libraries (Worker / server)

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| @cantoo/pdf-lib | 2.11.1 (MIT, published 2026-09-15) | Split by page range, merge, images to PDF, read encrypted PDFs | Logics 6 MB limit handling, "combine 3 phone photos into one PDF". Pure JS, runs in Workers. | MEDIUM-HIGH |
| unpdf | 1.8.1 (MIT, unjs) | Text extraction from PDFs (serverless PDF.js build) | Deterministic doc classification/extraction before falling back to OpenRouter. Text only: page-to-image rendering needs native `@napi-rs/canvas`, which Workers cannot load. | MEDIUM-HIGH |
| jose | 6.2.12 | Verify Plaid webhook JWT (ES256) | Plaid `Plaid-Verification` header; also the fallback for Supabase JWT verification via `createRemoteJWKSet`. Pulled in transitively by `@supabase/server`. | HIGH |
| zod | 4.6.5 | Shared schemas | Same package as frontend. | HIGH |
| (plain `fetch` clients, ~50 lines each) | n/a | Logics, Plaid, Truv, Teller, Smarty, OpenRouter | One small typed client per provider behind a `BankProvider` interface (Plaid/Teller). See "What NOT to Use" for the `plaid` npm package. | HIGH |

### Development and Test Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| Vitest | 5.0.3 | Unit/integration (all three projects) | Already on 5.0.2 in the repo. Use `projects` config: `web` (jsdom), `worker` (Workers plugin), `engine` (node). Spike: if Vitest 5 + Workers plugin misbehaves, pin the whole repo to `~4.1.11` (the plugin supports it for certain). |
| @cloudflare/vitest-plugin | 1.4.0 | Run Worker tests inside workerd with real bindings (Queues, assets) | `cloudflareTest({ wrangler: { configPath } })`. Replaces `@cloudflare/vitest-pool-workers`. Add `@cloudflare/vitest-plugin/types` to the test `tsconfig`. |
| msw + @msw/cloudflare | 3.0.3 / 0.2.0 | Mock Logics/Plaid/Truv/OpenRouter outbound calls in Worker tests | Cloudflare's own changelog points here for outbound mocks. |
| @testing-library/react + user-event | 16.3.3 / 14.6.7 | Component tests under jsdom | |
| jsdom | 30.1.2 (repo has ^26; either works) | DOM for unit tests | Keep whatever Vitest 5 resolves cleanly. |
| @playwright/test | 1.64.0 | E2E, mobile-first | Projects: `iPhone` and `Pixel` device descriptors for `/c/*`, desktop Chromium for `/admin/*`. Stub the bank/payroll providers via the provider interface; do not automate Plaid/Truv iframes. |
| Supabase pgTAP (`supabase test db`) | with CLI | RLS policy tests | Non-negotiable given tax/bank data. Needs Docker locally (Windows Home: Docker Desktop + WSL2). Fallback: a dedicated Supabase branch/project for tests. |
| ESLint + typescript-eslint | 10.12.0 / 8.x | Lint | typescript-eslint caps TS at <6.1, hence the TS pin. |
| Prettier + prettier-plugin-tailwindcss | 3.9.10 / 0.7.x | Format | As shadcn-admin. |
| knip | 6.41.0 | Dead-code check | Optional; helps after stripping Clerk/demo code from the fork. |
| Python `unittest` | stdlib | Existing 27 engine tests | Keep until the TS parity suite is green. |

---

## 1. Admin shell: fork `satnaing/shadcn-admin`

**Decision:** fork it, delete what we do not use, keep its structure.

- Stats (GitHub API, today): 15,684 stars, MIT, last push 2026-09-10, not archived. Dependencies read from its `package.json`: React 19.2, Vite 8, Tailwind 4.2, TanStack Router 1.168 / Query 5.99 / Table 8.21, Zod 4, RHF 7, TS ~6.0.3, Vitest 4.1 (browser mode), ESLint 10. It is current, not stale.
- It gives us the exact pieces PROJECT.md asks for: collapsible sidebar, header, command palette (`cmdk`), data tables with faceted filters and row actions (users/tasks examples), dialogs, settings pages, error pages, dark mode.
- **Strip on day one:** `@clerk/react` (we use Supabase Auth), `axios` (use `fetch`), `@faker-js/faker` and all demo data, `react-top-loading-bar` if unused, the demo "chats/apps/users" features. Replace `routes/clerk/*` with a Supabase sign-in route.
- **Bump to match our test stack:** its `vitest ^4.1.4` and `@vitest/browser-playwright ^4.1.4` should move to 5.0.3 (the repo is already on Vitest 5.0.2) or be left on 4.1.x if the Workers-plugin spike fails.
- **Layout:** one Vite project at a new top-level `app/` (or reuse `src/frontend/`), containing `src/` (SPA) and `worker/` (Hono). `@cloudflare/vite-plugin` needs the Worker inside the same Vite project. Delete `@material/web` and the old vanilla modules once the new shell lands; the 32-question contract (`questions.ts`) and `document-upload/requests.ts` logic are ported, not discarded.
- **Two route trees, one SPA:** `routes/_admin/*` (guarded by Supabase session) and `routes/c.$token/*` (guarded by Worker-validated link token). Client tree must not import admin chrome (sidebar, tables) so TanStack's route-level code-splitting keeps the phone bundle small.

**Reference repos to copy from (stars from GitHub API today; note licences):**

| UI area | Repo | Stars | Licence | Use |
|---------|------|-------|---------|-----|
| Admin shell, sidebar, data tables, cmdk | `satnaing/shadcn-admin` | 15.7k | MIT | Copy code freely. |
| Primitive components | `shadcn-ui/ui` | 125.3k | MIT | `npx shadcn add ...`. |
| Routing | `TanStack/router` | 15.2k | MIT | File-based routes, code splitting. |
| Embedded Plaid Link / flow | `plaid/pattern` (+ `plaid/react-plaid-link` 287) | 544 | MIT | Copy Link token + exchange + webhook handling patterns. |
| DocuSeal embedded form | `docusealco/docuseal-react` | 69 | MIT | Copy component usage. |
| Data-heavy list/status badge UX | `frappe/erpnext` | 40.0k | **GPL-3.0** | Visual/UX reference only. Do not copy code into a product you intend to resell. |
| Financial tables, money fields | `bigcapitalhq/bigcapital` | 3.9k | **AGPL-3.0** | Reference only. |
| Upload, builder, submission status screens | `docusealco/docuseal` | 18.7k | **AGPL-3.0** | Reference only (use their MIT React SDK for the actual embed). |
| Magic-link client document collection | `seziro-team/gather` | 0 | **AGPL-3.0**, created 2026-07-28 | Pattern only. 0 stars and 2 months old: it is a design reference, not a dependency. |
| Hono + Supabase | `supabase/server` | 94 | MIT | Hono adapter source and `examples/frameworks`. |

CLAUDE.md tells us to "use their components". For GPL/AGPL repos that means *design and interaction patterns re-implemented in shadcn/Tailwind*, not pasted source, because the plan is to white-label and resell.

## 2. Worker API: Hono + Supabase

**Decision:** one Worker (`worker/index.ts`) exporting `{ fetch, queue, scheduled }`, Hono as the HTTP router.

- Verified: Cloudflare's official docs show `createClient(env.SUPABASE_URL, env.SUPABASE_KEY)` in a Worker `fetch` handler and a Hyperdrive alternative; Supabase publishes a Hono quickstart (`npx supabase@latest bootstrap hono`).
- **Use `@supabase/supabase-js` in "server mode":** `createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })`. Create it per request (cheap), not at module scope, so no cross-request state.
- **Auth, staff routes:** `app.use('/api/admin/*', withSupabase({ auth: 'user' }))` from `@supabase/server/adapters/hono`; handlers get `c.var.supabaseContext.supabase` (RLS-scoped as the staff user) and `.supabaseAdmin` (bypass, for audit/log writes). Env on Workers: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_JWKS` or `SUPABASE_JWKS_URL` (documented in the package's `environment-variables.md`). **Fallback if the spike fails:** Hono's built-in `jwk({ jwks_uri: ${SUPABASE_URL}/auth/v1/.well-known/jwks.json })` or `jose.createRemoteJWKSet` + `jwtVerify`, both documented by Supabase and Hono. Verify the `iss`/`aud`/`role` claims either way.
- **Auth, client routes (`/api/c/:token/*`):** not Supabase Auth. Link token = 32 random bytes, base64url, stored only as a SHA-256 hash with `expires_at`, `revoked_at`, `case_id`, `scopes`. Middleware hashes the presented token, loads the link row with the admin client, rejects expired/revoked, and puts `{caseId, requestId}` in context. Every client query is then explicitly filtered by that `caseId` in server code (the browser never holds a Supabase credential for the client portal). Add `Referrer-Policy: strict-origin` (Smarty's embedded key needs a referrer/host) and `X-Robots-Tag: noindex`, `Cache-Control: no-store` on `/c/*` and `/api/c/*`, because the token sits in the URL path and third-party scripts (Plaid, Truv, Smarty) load on that page.
- **Webhooks (`/webhooks/plaid|truv|docuseal`):** read the raw body first, verify the signature (Plaid: ES256 JWT in `Plaid-Verification` plus SHA-256 body hash via `jose`; Truv and DocuSeal: HMAC/secret per their docs, confirm during that phase), `INSERT ... ON CONFLICT DO NOTHING` into `webhook_events` keyed by provider event id for idempotency, `env.JOBS.send(...)`, return 200 immediately. Do the real work in the queue consumer.
- **Browser to Supabase directly:** staff SPA uses `supabase-js` with the publishable key for sign-in and RLS-protected reads. All side-effecting or secret-bearing calls (Logics, Plaid, Truv, DocuSeal, Smarty keys, OpenRouter) go through the Worker.
- **Do not use `@supabase/ssr`:** it is for cookie sessions in SSR frameworks; this is an SPA plus a stateless Worker.
- **Bundle layout:** keep every file under the 500-line rule: `worker/routes/*.ts` per resource, `worker/providers/{logics,plaid,teller,truv,docuseal,smarty,openrouter}.ts`, `worker/jobs/*.ts`, `worker/engine/*.ts`, `worker/middleware/*.ts`. Each gets a `docs/` companion per CLAUDE.md.

## 3. The 433-A engine: port to TypeScript (Python becomes the test oracle)

**Decision:** port `financial_data.py`, `determination.py`, the `StandardsRepository` Protocol, and the intake-workflow logic to TS under `worker/engine/` (shared types in `shared/`). Keep the Python files and their 27 tests in the repo, unchanged, as the oracle.

Why porting beats keeping Python as a service:

- The engine is small and I/O-free: `determination.py` is 228 lines of arithmetic; `standards.py` 35; `financial_data.py` 95. The only I/O is behind the existing `StandardsRepository` Protocol (six lookups), which maps one-to-one onto a TS interface. It was designed to be ported.
- Python on Workers is a poor fit today: Python Workers run on Pyodide (CPython compiled to WebAssembly); the stdlib is available except `multiprocessing` and `threading`; third-party support is limited to pure-Python and PyEmscripten wheels ("WebAssembly support for Python packages is still in early stages", Cloudflare docs). `http.server` is irrelevant and `psycopg` needs raw TCP, so the current `PostgresStandardsRepository` cannot run there.
- The alternative of a separate Python service (Cloudflare Containers, Workers Paid, billed per 10 ms active with 200 GB-hours/month included, or Fly/Render) adds a second deploy artifact, cold starts, a second auth boundary, and a second language for a 228-line function. Not worth it. Keep this as the documented fallback if the engine ever grows heavy dependencies.
- One language means shared Zod/TS types between intake form, Worker, and the 433-A view, and Vitest can test the engine without a database.

How to port safely (this is domain-sensitive per CLAUDE.md):

1. **Mechanical port only.** No threshold, formula, haircut, or wording changes: 0.8 factors, $1,000 reserve, $3,450 vehicle exemption, $11,980 personal effects, $50,000 simple-plan cap, $500 equity gate all stay exactly as in Python. (Hard-coding them is a known concern in CONCERNS.md; fixing it is a separate, sourced change, not part of the port.)
2. **Golden fixtures:** write a one-off Python script (new file, own doc) that runs `determine_resolution_path` over 50-100 generated `FinancialData` cases (every branch: compliance block, CNC, negative-NDI-with-equity, simple plan, non-simple IA, manual review; legacy vehicle totals vs per-vehicle lists; joint offer; ages 64/65) with a fake repository, and dumps `{input, fakeStandards, expected}` JSON. The TS Vitest `engine` project loads that JSON and asserts deep equality.
3. **Float parity:** JS `number` is IEEE-754 double like Python `float`, so `x * 0.8`, `Math.ceil((owed / months) * 100) / 100` match exactly if operation order is preserved. Preserve the summation order of the expense dict (JS object insertion order matches Python dict order) and the `max()`/`min()` call structure. Do not introduce `Decimal`/cents in the port, or results will drift from the oracle.
4. **NULL vs 0:** model facts as `number | null`; required-and-null throws a typed `MissingFactError` that blocks evaluation (CLAUDE.md rule). Python's current defaults-to-0 outside the DB path is a known issue; the TS port should be stricter, and the parity fixtures should only use fully-populated cases so parity is unaffected.
5. **Standards via RPC:** move the six SQL queries from `standards_repository.py` into Postgres functions (`get_national_standard(int)`, `get_housing_standard(text,text,int)`, ...) in `src/schemas/`, keep parameterised semantics, and implement `SupabaseStandardsRepository` calling `supabase.rpc`. Tests use a fake repository, never a live DB (existing project rule).
6. **Exit criteria for retiring Python determination:** parity suite green in CI plus CPA/EA (Nicole/Sandra) spot-check of three real-shaped cases.

`document_parse.py` (954 lines, PDF classification/extraction with optional OpenRouter) is a **separate** decision. For the Oct 12 demo do not port it: classify uploads with a Worker-side OpenRouter call (after a deliberate redaction/consent decision, per PROJECT.md security notes) and use `unpdf` text extraction where a deterministic path is needed. Port its regex extractors in a later phase, splitting into modules under 500 lines.

## 4. PDF handling on Workers (Logics 6 MB limit)

**Decision:** `@cantoo/pdf-lib` for structure operations, `unpdf` for text, executed in the Queue consumer, never inline in the staff "push" click request.

- `pdf-lib` 1.17.1 (MIT) was last published 2022-05 and is effectively unmaintained. `@cantoo/pdf-lib` 2.11.1 (MIT) is the maintained fork (published 2026-09-15), same API (`PDFDocument.load/create`, `copyPages`, `save`), plus password/encrypted-PDF support (`load(bytes, { password })`, `ignoreEncryption` to detect). Bank statements are sometimes encrypted with an empty user password; the fork handles it.
- `unpdf` 1.8.1 bundles a serverless PDF.js build with the native worker and WASM disabled, so it runs on Workers for `getDocumentProxy` + `extractText`. `renderPageAsImage` requires `@napi-rs/canvas` (native), which does not run on Workers: no page rasterisation here.
- **Splitting algorithm** (`worker/jobs/pdf-fit.ts`): target 5.5 MiB (headroom under Logics' "6 MB"; treat MB as MiB-ambiguous and stay conservative). If `bytes <= target` upload as is. Else load once, then greedily add pages to a new `PDFDocument` via `copyPages`, `save({ useObjectStreams: true })`, measure, and start a new part when the next page would cross the target. Name parts `Statement_2026-03 (part 2 of 3).pdf` and pass `Comment`/`FileCategoryID` to Logics. Because `copyPages` duplicates shared resources (fonts) into each part, the parts sum to more than the original; that is expected.
- **Hard case:** a single page above the limit (scanned image PDF). Workers cannot recompress images cheaply. Mitigations in order: compress photos client-side before upload (`browser-image-compression`, JPEG quality step-down until under ~4 MB), cap bucket `fileSizeLimit` (e.g. 25 MB), and if a PDF page is still too big mark the item "needs manual compression" in the admin UI rather than failing silently. If this occurs often, add a Cloudflare Container running `qpdf`/Ghostscript as a later phase.
- **Limits that matter (Cloudflare docs, today):** 128 MB memory per isolate, so cap input size and process one document per queue message (concurrency `max_concurrency` low); CPU 30 s default on Paid (raise to 5 min with `limits.cpu_ms` if needed); consumer wall time 15 min; subrequests 10,000 on Paid (50 on Free, which would break multi-document pushes). Stream, do not buffer, whenever you can (Cloudflare's best-practices guide).
- **Images to PDF:** `pdf-lib` `embedJpg/embedPng` handles JPEG/PNG; HEIC must be converted in the browser (iOS Safari usually hands back JPEG when `accept="image/*"` is used; verify on device).
- **Do not use `mupdf`** (1.28.1, AGPL-3.0-or-later): licence conflicts with reselling a SaaS, and WASM size/memory is large. **Do not use `pdfjs-dist` directly** on Workers; `unpdf` already packages it correctly.

## 5. Jobs, reminders, webhook retries: Queues + Cron

**Decision:** Queues for work, Cron for time. No Durable Objects. No Workflows in v1.

| Need | Mechanism | Detail |
|------|-----------|--------|
| Webhook processing (Plaid `SESSION_FINISHED`, Truv `task-status-updated`/`order-status-updated`, DocuSeal completion) | Webhook route verifies + records + `env.JOBS.send()`; consumer does token exchange, `transactions/sync`, statement download, status update | Handler returns 200 quickly so providers do not retry-storm; idempotency key in `webhook_events`. |
| Retry with backoff | Queue consumer: on failure `msg.retry({ delaySeconds: min(2 ** msg.attempts * 30, 86400) })`; `max_retries: 8`; `dead_letter_queue: "resspark-dlq"` | Delay cap is 24 h (Queues limit). DLQ consumer writes a `failed_jobs` row shown in the admin dashboard ("Needs attention"). Without a DLQ, failed messages are discarded (Cloudflare config docs). |
| Logics push (split PDFs, upload N docs, write activity note) | One message per document, `max_concurrency` small | Idempotency: store `logics_document_id` per item before writing the note; a retry must not double-upload. |
| Reminders ("client has not opened the link in 24 h") | Cron `*/15 * * * *` selects due rows (`next_reminder_at <= now()`), enqueues `send_reminder` messages | Reminder state lives in Postgres, not in timers. Survives deploys. Also expires links and flags "overdue". |
| Live status in admin | TanStack Query `refetchInterval: 5000` (visible tab only) | Upgrade path: Supabase Realtime `postgres_changes` on `request_events` (RLS applies). Polling first because it is one line and needs no quota thinking for the demo. |
| Bank/payroll pulls that can take minutes | Queue consumer (15 min wall limit) | If a multi-step, days-long flow appears (e.g. wait for client, then reminders, then escalate), reach for Workflows then (`step.do` with retries, `step.sleep` up to 365 days; available on Free and Paid). Not needed for v1; Cron + Postgres state covers it. |

Why not Durable Objects: nothing here needs a single-threaded coordinator or per-entity websocket state; Postgres unique constraints and `SELECT ... FOR UPDATE SKIP LOCKED`-style RPCs give idempotency. Revisit only if per-case real-time presence is requested.

Message design: one queue, typed envelope `{ type, caseId, requestId, itemId?, dedupeKey }` validated with Zod in the consumer; messages stay far under 128 KB because they carry ids, never documents.

Cost sanity (Paid): $5/month Workers + Queues inside 1M ops/month included + Email 3,000/month included. Integration usage costs (Plaid about $10-14 per user all-in, Truv pay-as-you-go) dominate.

## 6. Test stack

- **Vitest 5.0.3, one config with `projects`:** `engine` (node, pure TS, includes the Python-generated golden JSON), `worker` (`cloudflareTest` plugin, real Queue/assets bindings, MSW for Logics/Plaid/Truv/OpenRouter), `web` (jsdom + Testing Library for form and step-list logic: intake applicability, document-request derivation, email/phone validation, step-state rendering).
- **Spike before committing (30 minutes):** run one Worker test under Vitest 5.0.3 with `@cloudflare/vitest-plugin` 1.4.0. The plugin declares support for `^4.1.0 || ^5.0.0` and the old package's Vitest-5 failure (workers-sdk issue #15618) was about the old name, but Cloudflare's own getting-started page still installs `vitest@^4.1.0`. If anything misbehaves, pin the entire repo to `vitest ~4.1.11` (shadcn-admin is already on 4.1.x).
- **Playwright 1.64.0:** run against the built app served by `vite preview` (Cloudflare plugin runs the Worker in workerd) or `wrangler dev`. Required scenarios: (a) staff sign in, look up case, send link, copy link; (b) client opens `/c/<token>` in an iPhone and Pixel viewport, sees firm and agent name and the step list, uploads a file, resumes after reload; (c) expired/revoked token shows a safe error. Use the `BankProvider` interface with a fake provider so tests never drive Plaid/Truv iframes; keep one manual sandbox smoke checklist (Plaid sandbox, Truv `goodlogin`/`goodpassword`, `multiple.employments`).
- **RLS tests are the highest-value tests in the project:** pgTAP via `supabase test db` asserting that staff A cannot read staff B's firm data, anon cannot read anything, and storage policies block cross-case downloads.
- **Python:** `python -m unittest discover -s src/tests -v` stays in CI until engine retirement.

---

## Installation

```bash
# Frontend + Worker in one Vite project (inside app/ or src/frontend/)
npm install react@19.3.0 react-dom@19.3.0 \
  @tanstack/react-router@1.170.42 @tanstack/react-query@5.104.1 @tanstack/react-table@8.21.3 \
  react-hook-form@7.89.0 @hookform/resolvers@5.9.1 zod@4.6.5 \
  lucide-react sonner date-fns cmdk zustand class-variance-authority tailwind-merge tw-animate-css \
  @supabase/supabase-js@2.117.3 \
  react-plaid-link@5.0.0 @docuseal/react@1.0.75 \
  tus-js-client@4.3.1 browser-image-compression libphonenumber-js

# Worker side
npm install hono@4.13.13 @hono/standard-validator \
  @supabase/server@1.9.1 jose@6.2.12 @cantoo/pdf-lib@2.11.1 unpdf@1.8.1 @docuseal/api@1.0.25

# Build + dev tooling
npm install -D vite@8.3.4 @vitejs/plugin-react@6.1.2 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 \
  @tanstack/router-plugin @tanstack/react-query-devtools \
  @cloudflare/vite-plugin@1.63.1 wrangler@4.149.0 \
  typescript@~6.0.3 eslint typescript-eslint prettier prettier-plugin-tailwindcss knip

# Test tooling
npm install -D vitest@5.0.3 @cloudflare/vitest-plugin@1.4.0 msw @msw/cloudflare \
  jsdom @testing-library/react @testing-library/user-event @playwright/test@1.64.0

# shadcn components (copied in, not a runtime dependency)
npx shadcn@latest init
npx shadcn@latest add button card table dialog sheet sidebar badge form input select tabs progress sonner

# Generate Worker Env types and Supabase DB types
npx wrangler types
npx supabase gen types typescript --project-id <ref> > shared/database.types.ts

# Secrets (never commit; use .dev.vars locally)
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put LOGICS_API_KEY   # plus LOGICS_API_SECRET, PLAID_*, TRUV_*, DOCUSEAL_*, SMARTY_*, OPENROUTER_API_KEY
```

Minimal `wrangler.jsonc` shape (from Cloudflare's SPA and Queues docs):

```jsonc
{
  "name": "resspark",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-06",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/webhooks/*"]
  },
  "queues": {
    "producers": [{ "queue": "resspark-jobs", "binding": "JOBS" }],
    "consumers": [{ "queue": "resspark-jobs", "max_batch_size": 1, "max_retries": 8,
                    "dead_letter_queue": "resspark-dlq", "max_concurrency": 3 }]
  },
  "triggers": { "crons": ["*/15 * * * *"] },
  "observability": { "enabled": true }
}
```

(Verify the exact build output directory emitted by `@cloudflare/vite-plugin`; the plugin generates the deploy config, so the final `assets.directory` may be managed for you.)

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not (or when) |
|----------|-------------|-------------|-------------------|
| Admin starter | `satnaing/shadcn-admin` (15.7k, Vite SPA) | `Kiranism/next-shadcn-dashboard-starter` (7.1k), `arhamkhnz/next-shadcn-admin-dashboard` (3.1k) | Both are Next.js. We need a static SPA on Workers; Next on Cloudflare (OpenNext) adds a runtime we do not need. |
| Routing | TanStack Router (as in the starter) | React Router 7 | Would mean rewriting the starter's route layer for no gain. |
| API framework | Hono 4 | itty-router, Elysia, Express/Fastify | Express/Fastify assume Node servers. Hono has first-party Supabase adapter and typed Workers bindings. |
| Static hosting | Workers static assets (one Worker) | Cloudflare Pages + separate Worker | Two deploys, CORS, split secrets. Current Cloudflare React guide targets Workers with assets. |
| DB access in Worker | supabase-js + RPC | Hyperdrive + `postgres`/Drizzle | Extra moving parts, bypasses PostgREST/RLS parity. Choose only if we need heavy SQL or transactions across many tables inside one request. |
| Engine runtime | TS port with Python oracle | Python Worker (Pyodide), Cloudflare Container, Fly/Render service | See section 3. Choose a container only if the engine gains native Python dependencies. |
| PDF | `@cantoo/pdf-lib` + `unpdf` | `pdf-lib` 1.17.1, `mupdf`, Cloudflare Container with qpdf/Ghostscript | Original `pdf-lib` unmaintained since 2022; `mupdf` AGPL; container only if single oversized pages become common. |
| Jobs | Queues + Cron | Workflows, Durable Objects alarms, Supabase `pg_cron` + `pgmq` | Workflows for long human-in-the-loop sequences later; `pg_cron` is a valid zero-new-infra reminder scanner but splits job logic across two platforms. |
| Live status | Query polling (then Realtime) | Durable Object websockets | Overkill for a few staff users. |
| Email | Cloudflare Email Service binding | Resend/Postmark over `fetch` | Use the alternative if domain onboarding or beta status blocks Oct 12. |
| Tests | Vitest 5 + Playwright | Jest, Cypress | Jest lacks workerd integration; Cypress has weaker mobile-device emulation than Playwright descriptors. |
| Upload | tus-js-client direct to Supabase | Uppy (`@uppy/core` 6.2.0, `@uppy/tus` 6.0.0) | Uppy brings a full UI we would restyle; add only if per-file preview/edit UX is demanded. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@cloudflare/vitest-pool-workers` | Renamed in Aug 2026; last version 0.23.0 peers Vitest 4 only | `@cloudflare/vitest-plugin` 1.4.0 |
| TypeScript 7.0.2 (npm `latest`) | `typescript-eslint` peers `<6.1.0`; starter pins ~6.0.3 | `typescript@~6.0.3` |
| TanStack Table 9.x | New major; shadcn data-table recipes and the starter use v8 | `@tanstack/react-table@8.21.3` |
| `@clerk/react` (in the starter) | Wrong auth system; adds vendor and cost | Supabase Auth |
| `@material/web`, the vanilla `src/frontend/src/*.ts` DOM modules | Being fully replaced | shadcn/ui |
| `plaid` npm package (48.0.0) | Depends on `axios` (Node http adapter assumptions); untested path on Workers | ~50-line typed `fetch` client against Plaid REST; `react-plaid-link` in the browser only |
| Legacy Supabase `anon`/`service_role` keys | Deprecated by end of 2026 | `sb_publishable_...` / `sb_secret_...` |
| `@supabase/ssr` | Cookie-session helper for SSR frameworks | `supabase-js` in the SPA, stateless JWT verification in the Worker |
| Hyperdrive/Drizzle/`pg` in v1 | Not needed; `@supabase/server`'s `pg` path needs raw TCP and is documented as non-Workers | PostgREST + RPC |
| Python Workers (Pyodide) for the engine | Early package support, `psycopg` needs sockets | TS port with golden-fixture parity |
| `mupdf` | AGPL-3.0-or-later; large WASM | `@cantoo/pdf-lib` + `unpdf` |
| Original `pdf-lib` 1.17.1 | No release since 2022; no encrypted-PDF support | `@cantoo/pdf-lib` |
| Durable Objects / Workflows in v1 | No requirement they uniquely solve | Queues + Cron + Postgres state |
| Copying code from ERPNext (GPL-3.0), Bigcapital (AGPL-3.0), DocuSeal (AGPL-3.0), Gather (AGPL-3.0) | Copyleft conflicts with white-label resale | Re-implement patterns in shadcn/Tailwind; use MIT SDKs (`@docuseal/react`, `react-plaid-link`) |
| LangChain / provider SDKs for OpenRouter | Needless weight | `fetch` to OpenRouter's OpenAI-compatible endpoint with a model from `OPENROUTER_MODEL` |
| Sending client documents to OpenRouter unredacted | Existing known concern; tax and bank data | Deliberate consent/redaction step first; prefer deterministic `unpdf` extraction |
| Free Workers plan | 10 ms CPU, 50 subrequests | Workers Paid ($5/mo) |

## Stack Patterns by Variant

**If the Vitest 5 + Workers plugin spike fails:**
- Pin `vitest ~4.1.11` and `@vitest/*` 4.1.x repo-wide. Same API, same shadcn-admin test setup.

**If `@supabase/server` has a Workers rough edge:**
- Use Hono's `jwk()` middleware against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (or `jose`), plus two small `createClient` factories (user-scoped with the caller's `Authorization` header, admin with `sb_secret_`). About 40 lines; zero lock-in.

**If Teller replaces Plaid for a client:**
- Implement the `BankProvider` interface (`createLinkSession`, `handleWebhook`, `listAccounts`, `listTransactions`, `listStatements?`) once per provider; select by one `BANK_PROVIDER` var. Teller uses `connect.js` and basic auth on the access token and has no statements product, so UI must tolerate `listStatements` being absent.

**If Cloudflare Email Service is not ready by Oct 12:**
- Send via Resend over `fetch` from the queue consumer; the copyable link remains the guaranteed fallback (it is already a core requirement).

**If a client portal page needs to work behind weak mobile networks:**
- Keep `/c/*` route bundle under ~150 KB gzip (no TanStack Table, recharts, cmdk), lazy-load Plaid/Truv/DocuSeal scripts only on their step.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@vitejs/plugin-react@6.1.2` | `vite@^8` only | Do not combine with Vite 6/7. |
| `@cloudflare/vite-plugin@1.63.1` | `vite ^6.1 \|\| ^7 \|\| ^8`, `wrangler ^4.149.0` | Pin wrangler to 4.149.x or newer. |
| `@cloudflare/vitest-plugin@1.4.0` | `vitest ^4.1.0 \|\| ^5.0.0` | Replaces `vitest-pool-workers`. |
| `vitest@5.0.3` | `vite ^6.4 \|\| ^7 \|\| ^8`, Node `^22.12 \|\| ^24 \|\| >=26` | Existing `engines: >=18` must change. |
| `@vitest/browser-playwright@5.0.3`, `@vitest/coverage-v8` | must match `vitest` exactly (5.0.3) | The starter's 4.1.4 copies must be bumped together or not at all. |
| `typescript-eslint@8.x` | `typescript <6.1.0` | Reason for TS ~6.0.3. |
| `@tailwindcss/vite@4.3.3` | `vite ^5.2 \|\| ^6 \|\| ^7 \|\| ^8` | OK with Vite 8. |
| `@tanstack/router-plugin` | `@tanstack/react-router ^1.170.42` (peer) | Install matching router version. Starter pins `^1.167.22` for plugin and `^1.168.22` for router; take latest of both together. |
| `@supabase/supabase-js@2.117.3` | Node `>=22` (tooling), any Workers runtime | Create clients per request. |
| `@supabase/server@1.9.1` | `hono ^4`, `@supabase/supabase-js ^2`, Node `>=22`, Workers needs `nodejs_compat` | Hono adapter at `@supabase/server/adapters/hono`. |
| Supabase TUS resumable upload | chunk size exactly 6 MB | Per Supabase docs; do not change `chunkSize`. |

## Open Items for Phase-Level Research

1. **Spikes (each under an hour, do first in Phase 1):** Vitest 5 + `@cloudflare/vitest-plugin`; `@supabase/server` Hono adapter on `wrangler dev`; signed upload URL token + TUS from an unauthenticated browser; Cloudflare Email Service sender-domain onboarding.
2. **Webhook signature schemes** for Truv and DocuSeal were not verified here; confirm from their docs in the integration phase. Plaid's JWT scheme is documented and `jose` handles it.
3. **Logics API** behaviour (file categories, duplicate uploads, rate limits) needs a pass against `Logics_API_Documentation.docx.md` with real credentials; not covered by this stack research.
4. **Image-heavy PDFs over 6 MB per page** may need a container-based compressor; decide after seeing real client uploads.
5. **Realtime vs polling** decision can wait until staff count or latency complaints appear.
6. **`react-dropzone` 20.1.3** version/API unverified; skip unless admin drag-drop is requested.

## Sources

- npm registry (`npm view`, 2026-10-10): versions, dist-tags, peerDependencies, engines, licences for every package named above. HIGH.
- GitHub API (`gh api`, 2026-10-10): stars, licences, push dates for satnaing/shadcn-admin, shadcn-ui/ui, honojs/hono, TanStack/router, docusealco/docuseal and docuseal-react, frappe/erpnext, bigcapitalhq/bigcapital, plaid/pattern, plaid/react-plaid-link, seziro-team/gather, supabase/server; `satnaing/shadcn-admin` `package.json`. HIGH.
- Context7 `/llmstxt/developers_cloudflare_workers_llms-full_txt` and `developers.cloudflare.com`: Vite plugin React guide, SPA `assets` config, Queues consumer config and DLQ, Cron `scheduled` handler, Workflows example, Python Workers stdlib/packages, Workers limits (scraped: CPU, memory, subrequests, cron CPU, duration), Queues limits and pricing, Workflows limits, Containers overview/pricing, Email Service pricing, Vitest plugin getting-started. HIGH.
- Supabase docs via Context7 `/websites/supabase_guides` and supabase.com: JWT verification with `jose`/JWKS, `getClaims`, Storage signed upload URL, resumable (TUS) uploads, bucket limits, connection pooling, new API keys migration guide ("anon and service_role deprecated by end of 2026"), "Introducing @supabase/server" (2026-05-06), Cloudflare Workers Supabase integration page. HIGH.
- `raw.githubusercontent.com/supabase/server` README and `docs/environment-variables.md`: Workers env vars (`SUPABASE_JWKS`/`SUPABASE_JWKS_URL`, `nodejs_compat`, `pg` path not for Workers). MEDIUM-HIGH (read directly; package is new).
- Context7 `/websites/hono_dev`: Bindings/Variables generics, validators (`sValidator`), `jwk` middleware, `cloneRawRequest`. HIGH.
- Context7 `/unjs/unpdf` and `/cantoo-scribe/pdf-lib`: serverless PDF.js build (worker/WASM disabled, canvas needed only for rendering), `copyPages`, encrypted PDF handling. MEDIUM-HIGH.
- Firecrawl developer search: workers-sdk issue #15618 (Vitest 5 vs old pool package) and Cloudflare changelog 2026-08-19 (rename to `@cloudflare/vitest-plugin`). HIGH.
- Project files read: `.planning/PROJECT.md`, `.planning/codebase/STACK.md`, `CLAUDE.md`, `src/determination.py`, `src/standards_repository.py` (sizes and structure of the engine). HIGH.
- Not verified (explicitly): Truv and DocuSeal webhook signature formats, Cloudflare Email Service GA/beta status, Workers Paid price beyond the "$5 USD per month" figure shown on the Containers pricing page, Cloudflare Rate Limiting binding for token-guess protection (add and verify in the security phase).

---
*Stack research for: ResSpark two-sided tax-resolution document-collection platform*
*Researched: 2026-10-10*
