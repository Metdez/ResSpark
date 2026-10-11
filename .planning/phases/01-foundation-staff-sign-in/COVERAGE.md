# Phase 1 — API Coverage Decision Matrix

> Produced by gsd-planner because `api-coverage.cjs` returned `detected: true` over the PLAN bodies (signal: the `developer shell → Cloudflare API` trust boundary in Plan 03). Default is `INTEGRATE`; every `OPT-OUT` carries a one-line reason. Phase 1 integrates no product API for ResSpark's own features — the external surfaces below are platform/tooling APIs the foundation depends on, plus one gated sandbox spike.

| capability | decision | reason |
|------------|----------|--------|
| **Supabase Auth — Admin API** | | |
| `auth.admin.createUser` (email, password, `email_confirm`, `app_metadata`) | INTEGRATE | Plan 05 `create-staff.mjs` (D-14) |
| `auth.admin.listUsers` | INTEGRATE | Plan 05 `create-staff.mjs` idempotent re-run (lookup on `email_exists`) |
| `auth.admin.deleteUser` / `updateUserById` | OPT-OUT | No staff removal or edit flow in Phase 1; Phase 8 (MFA, WISP) revisits |
| `auth.admin.inviteUserByEmail` / `generateLink` (magic link) | OPT-OUT | D-14: email + password only, sign-ups disabled, magic link not in Phase 1 |
| **Supabase Auth — client** | | |
| `signInWithPassword`, `getSession`, `signOut`, auto-refresh | INTEGRATE | Plan 06 (PLAT-07) |
| `signUp` | OPT-OUT (disabled server-side) | D-14; Plan 05 pushes `enable_signup = false` and proves `signup_disabled` |
| JWKS `/.well-known/jwks.json` verification (ES256) via `jose` | INTEGRATE | Plan 06 `staff-jwt.ts` (D-15) |
| OAuth providers, phone OTP, MFA enrol/verify | OPT-OUT | Not in Phase 1 (MFA is Phase 8, PROD-02) |
| **Supabase Management API (through the CLI)** | | |
| `db query` (`POST /v1/projects/{ref}/database/query`) | INTEGRATE | Plan 04 `db-migrate.mjs` (D-10) |
| `projects api-keys` (`GET /v1/projects/{ref}/api-keys`) | INTEGRATE | Plan 05 `provision-secrets.mjs` (secret key read into memory only) |
| `config push` (`PATCH /v1/projects/{ref}/config/auth`) | INTEGRATE | Plan 05 sign-up disable |
| `db push` / `supabase link` with DB password | OPT-OUT | No database password is available; Management API path used instead (D-10) |
| `db advisors` | OPT-OUT | Requires CLI ≥ 2.81 (available) but adds nothing Phase 1's `rls.test.ts` does not prove; candidate for Phase 2 |
| **Supabase PostgREST (`/rest/v1/*`)** | | |
| Anonymous `GET` probe with the publishable key | INTEGRATE (test only) | Plan 04 `rls.test.ts` — the PLAT-02 proof |
| Any read/write from the SPA | OPT-OUT | D-15: Worker-only data path; the SPA never calls PostgREST for data in v1 |
| Worker reads/writes via `service_role` (`from`, `rpc('log_event')`) | INTEGRATE | Plan 05 `db/` module |
| **Supabase Storage** | | |
| `createBucket`, `createSignedUploadUrl`, `uploadToSignedUrl`, TUS `/upload/resumable/sign`, `list`, `remove`, `deleteBucket` | INTEGRATE (spike only) | Plan 08 spike (c); production use is Phase 3 (UPL-01) |
| **Cloudflare (wrangler / API)** | | |
| `wrangler deploy` (Workers Scripts API) | INTEGRATE | Plan 03 (PLAT-01) |
| `wrangler secret put` / `secret list` | INTEGRATE | Plan 05 (PLAT-03) |
| `wrangler queues create` | INTEGRATE (attempt) | Plan 03 per D-06; falls back without the `queues` block if the plan rejects it |
| `wrangler types` | INTEGRATE | Plans 03, 05, 07 (`worker-configuration.d.ts`) |
| Rate Limiting binding (`env.LINK_RATE_LIMITER.limit`) | INTEGRATE (with in-memory fallback) | Plan 07 (D-18, A-1) |
| Workers Logs `observability` | INTEGRATE (invocation logs OFF) | Plan 03 (PLAT-08) |
| Email Sending binding (`send_email`) | OPT-OUT | Workers Paid only; account is Free (F-1); spike (d) resolves to Resend in Phase 2 |
| Custom domain / routes, KV, D1, R2, Durable Objects, Pages | OPT-OUT | Not needed by Phase 1 scope; custom domain is deferred (CONTEXT Deferred Ideas) |
| **Truv (`https://prod.truv.com/v1/`)** | | |
| `POST /orders/` | INTEGRATE (gated spike) | Plan 08 spike (e) runs only if `TRUV_CLIENT_ID`/`TRUV_SECRET` exist; otherwise records `blocked: no Truv keys` |
| Bridge, webhooks, reports | OPT-OUT | Phase 4 (PAY-01..04, WEBH-01) |
| **Resend** | | |
| `POST /emails` | OPT-OUT (name reserved) | Phase 2 REQ-04; Phase 1 reserves `RESEND_API_KEY`/`MAIL_FROM` only |
| **IRS Logics** | | |
| Any endpoint | OPT-OUT | Phase 2 (lookup) / Phase 5 (push); Phase 1 ships only `logicsWriteGuard` and the `LOGICS_*` names |
