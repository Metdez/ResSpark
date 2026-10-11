# Project Research Summary

**Project:** ResSpark (two-sided tax-resolution document-collection platform; first customer ValorTax on IRS Logics)
**Domain:** Staff admin portal plus no-account mobile client portal. It collects bank, payroll, address, uploads and e-signatures, then pushes approved documents into the Logics CRM. A later 433-A pre-population view reuses the screening engine.
**Researched:** 2026-10-10
**Confidence:** MEDIUM-HIGH. Platform versions and limits are HIGH. Three stack spikes, Teller statements and legal scoping are MEDIUM/LOW.

## Executive Summary

ResSpark is a "connect-and-collect front door" for Logics. No competitor (IRSLogics, PitBullTax, TaxDome, Canopy, Clustdoc, Pipefile, Gather) uses a bank or payroll connection as the collection mechanism. They all ask clients for PDFs.

The recommended build is one Cloudflare Worker (Hono) that serves the SPA as static assets, the API, the queue consumer and cron. The front end is one React + Vite + shadcn SPA with two route trees (`/admin/*`, `/c/*`). Data lives in the already-provisioned Supabase project (Postgres, Auth for staff only, private Storage).

The design rules are:
- RLS-protected reads for staff.
- A token-gated client portal with no database identity.
- A single server-side gateway that holds every secret.
- Webhooks treated as hints and reconciled from provider APIs.
- A ledgered, human-gated write path into Logics.

The core value to protect is "send link, client connects, docs appear in the Logics case."

The main risks are trust and data handling, not technical difficulty:
- **Client link:** it is the only credential for a page that connects bank accounts.
- **Service-role key:** it bypasses RLS, so one missing `case_id` predicate leaks another client's file.
- **Logics:** it has no sandbox, no idempotency key, no list-documents call and a 6 MB cap.
- **Demo:** a demo against the real ValorTax tenant puts real PII in an uncontrolled environment.

The mitigations are cheap if built first:
- Hashed or MAC-signed expiring tokens exchanged for a cookie.
- Deny-by-default RLS with one data-access module.
- A push ledger with an `unknown` state.
- A read-only Logics key for the demo, plus `LOGICS_WRITE_ENABLED=false` and a test-CaseID allowlist.

## Resolved Conflicts

| # | Conflict | Decision | Why |
|---|---|---|---|
| 1 | Engine hosting: ARCHITECTURE.md says Python Worker via service binding; STACK.md and PITFALLS.md say TypeScript port. | **Mechanical TypeScript port in `worker/engine/`, with golden fixtures generated from the 27 Python tests. The Python files stay unchanged as the test oracle.** Retire Python determination only after parity is green in CI and Nicole/Sandra spot-check three cases. | Python Workers run on Pyodide and have no `psycopg` (it needs TCP). The engine is 228 lines of arithmetic behind a 6-method Protocol, so it ports one-to-one. One language also gives shared Zod/TS types. A container is the fallback only if the engine gains native Python dependencies. |
| 1a | CLAUDE.md: no threshold or formula change without a source and tests. | The port is mechanical only. All constants stay as-is: 0.8 factors, $1,000 reserve, $3,450 vehicle exemption, $11,980 personal effects, $50,000 simple-plan cap, $500 equity gate. Operation order and `Math.ceil((owed/months)*100)/100` are preserved. It uses plain `number`, not Decimal. Facts are `number \| null`, and a required null throws `MissingFactError`. Moving the constants into SQL is a separate sourced change. Standards come through Postgres RPC functions, and tests use a fake repository. | The math is domain-sensitive. |
| 2 | Licensing: the best-matching repos are GPL/AGPL and the product will be resold. | **Copy code only from MIT/Apache repos:** shadcn-admin, shadcn/ui, TanStack, Uppy, tus-js-client, react-dropzone, react-plaid-link, plaid/pattern, docuseal-react, jose, react-pdf, react-email, and the Actual Budget bank-sync boundary (shape only). **ERPNext (GPL), Bigcapital, DocuSeal, Gather, Documenso and UsTaxes (AGPL) are visual/structural references only.** DocuSeal is used as a service (cloud API or unmodified container), never forked. | Copyleft source-disclosure risk. PROJECT.md's "Gather proves the pattern" is overstated: Gather has 0 stars, is alpha and is AGPL. |
| 3 | Token design: STACK.md says a random token stored as a hash; ARCHITECTURE.md says an HMAC-signed, re-derivable token. | **HMAC-signed, stateful, re-derivable token** (`link_id` plus HMAC over `link_id` and `version`), with `expires_at`, `revoked_at` and a rotate `version`. First load exchanges it for an HttpOnly cookie and strips it from the URL. A GET never marks "opened"; the first explicit Start tap does. | Staff must be able to re-copy the link, which a hash-only token cannot support. |
| 4 | Plaid mode: PROJECT.md plans `hosted_link` with `delivery_method: sms`. | **Hosted Link, opened from our own portal button.** Use a fresh link token per tap, with a 900-1800 s lifetime and a fixed return route with a single-use nonce. **Do not use Plaid-sent SMS/email Link Delivery.** Success comes only from `SESSION_FINISHED` or `/link/token/get`, never from the redirect. | Link Delivery is beta, carries a per-link fee, and the Sandbox sends nothing, so it can't be demoed. |
| 5 | Plaid history and statements. | Set `transactions.days_requested` to 200-730 in every link token, because it is immutable and defaults to 90. Put `statements` in `required_if_supported_products`. Each account carries a statement status (available, not supported, or uploaded manually). Manual upload is first-class. | Statements cover about 40% of depository accounts. |
| 6 | Live status: polling versus Realtime. | Polling (5-10 s, visible tab) for the demo. Add Realtime as cache-invalidation hints later. Refetch is always the source of truth. | It's one line, versus publication and policy setup under deadline. |
| 7 | Email and SMS. | Cloudflare Email Service is a spike; the fallback is Resend over `fetch`. The copyable link is the guaranteed path. There is no own SMS and no automated texts in v1. Add a staff checkbox "client agreed to a text", and log it. | Email Service beta status is unconfirmed; TCPA and 10DLC add lead time. |
| 8 | 28 versus 32 questions: `question_definitions` has 28 rows, but CLAUDE.md and PROJECT.md say 32. | Reconcile in Phase 1, before wiring intake to the database. | Pre-existing discrepancy. |
| 9 | Test stack. | Vitest 5.0.3 projects (`engine`, `worker`, `web`), `@cloudflare/vitest-plugin` 1.4.0 (renamed from vitest-pool-workers), Playwright mobile, and pgTAP RLS tests. If the 30-minute spike fails, pin to `vitest ~4.1.11`. | |

## Verified Environment Facts (from the orchestrator, 2026-10-10)

- Cloudflare is authenticated via wrangler 4.149.0.
- Supabase project `zvkphuikjpwoauqdimcf` already holds the 15 baseline tables with IRS standards seeded: 16,115 housing rows, 209 MSA rows and 28 question_definitions rows. It has 0 cases, 0 auth users and 0 storage buckets. **The 0001 baseline is already applied. Add additive migrations only.**
- Node 24.14, pnpm 10.32 and Python 3.11 are installed. There is no `psql`.
- `supabase db query --linked --project-ref` works through the Management API but **must be run from a directory without the root `.env`**.
- Use `sb_publishable_` and `sb_secret_` keys.
- STACK.md's install commands use npm but the environment has pnpm. Pick one in Phase 1 and keep a single lockfile.

## Key Findings

### Stack
- **Hosting:** one Vite project with `src/` and `worker/`, built with `@cloudflare/vite-plugin` and deployed as one Worker with static assets. Workers Paid ($5/month) from day one, because the Free plan's 10 ms CPU and 50 subrequests break PDF work. Queues (1 queue plus a DLQ) and one `*/15` Cron. No Durable Objects or Workflows in v1. PostgREST and RPC only.
- **Front end:** a fork of `satnaing/shadcn-admin` (MIT). It runs React 19.3, Vite 8.3 and Tailwind 4.3. Strip Clerk, axios and the faker demo data. Pin TanStack Table 8.21.3 and TypeScript ~6.0.3.
- **Worker:** Hono 4.13 and supabase-js 2.117.3. Verify the staff JWT with the `@supabase/server` Hono adapter (spike). The fallback is Hono `jwk()` or `jose`.
- **Validation:** shared Zod 4 schemas. A custom 20-line typo-domain check; `email-validator` would pass `gmailcom`.
- **Provider clients:** plain `fetch` clients of about 50 lines each. Do not use the `plaid` npm package. Truv Bridge and Teller Connect load as script tags. DocuSeal uses `@docuseal/react` and `@docuseal/api`.
- **Uploads:** direct from the browser to Supabase Storage via a Worker-minted signed URL, using tus-js-client (6 MB chunks) and client-side image compression. Bytes never touch the Worker.
- **PDFs:** `@cantoo/pdf-lib` (split to 5.5 MiB parts) and `unpdf`, run in the Queue consumer. Avoid `mupdf` (AGPL). A single oversized page becomes a "needs manual compression" state.

### Features
- **Must have for the demo:**
  - Staff sign-in, and Logics lookup with a mandatory confirm card.
  - Request builder with seeded templates, and a copyable, revocable link.
  - Token portal with a step list and save/resume.
  - Plaid and Truv connects, each with an upload fallback.
  - Smarty address to county, and resumable uploads.
  - DocuSeal embedded signing.
  - Live status with an event timeline.
  - Per-item approve/reject, and a push to Logics with an activity note and a local ledger.
  - A real URL, RLS on every table, and verified webhooks.
- **Differentiators after the demo:**
  - A client-step "mirror" view for staff.
  - The 433-A pre-population view with source badges, proposed-versus-confirmed values, evidence drill-down, a Plaid category to 433-A line mapping table in SQL, and a worksheet export labeled "Not an IRS form".
  - Reminders (max 3, stop on completion) and a stuck-detector.
  - Teller, a DOB gate, and statement coverage checks.
  - Redacted AI classification as suggestions only.
- **Defer to v2+:** 433-F and OIC views, Spanish, multi-tenant white-label, Logics polling, and official IRS form PDFs.
- **Anti-features:** CRM replacement, client accounts, session replay on `/c/*`, AI auto-approval, LLM in the math, ongoing bank monitoring, own SMS, and signing the official 433-A in the portal.
- **Logics limits:** it can't read documents or write 433-A fields. ResSpark keeps its own push ledger and delivers 433-A output as an attached worksheet.

### Architecture
- **Write rule:** the browser never holds a secret and never writes to Postgres. Every mutation goes through the Worker into plpgsql RPCs, so the state change and the audit `events` row commit together.
- **Client isolation:** clients have no database identity. A single `clientScope(link)` module takes the request id from the verified link, never from the body, and returns allow-listed DTOs.
- **Webhooks:** verify the raw body, insert idempotently into `webhook_events`, and enqueue. The consumer re-reads provider state and applies a monotonic transition (`status_rank`). A 5-minute cron, client-triggered reconcile and a staff Refresh heal lost webhooks. Truv silently disables failing endpoints.
- **Components:**
  - SPA.
  - Hono API Worker.
  - Provider adapters behind interfaces (`BankProvider` with capabilities, `ObjectStore`, Logics).
  - Domain state machines.
  - TS engine.
  - Supabase (RLS, firm_id everywhere, encrypted `connection_secrets`).
  - Logics ledger with states queued, sending, sent, failed and unknown.
- **Data rule:** `case_financial_data` is the only canonical record. Connected data lands in `data_suggestions`, and staff acceptance is the only path in.

### Critical Pitfalls
1. **Demo contamination (C1):** use a read-only Logics key, `LOGICS_WRITE_ENABLED=false`, a code-enforced test-CaseID allowlist, fake cases, sandbox providers only, and a SANDBOX banner.
2. **Link as authentication (C2):** exchange the token for a cookie. Send no-referrer, no-store and noindex headers. A GET must not mark "opened". No analytics or replay on `/c/*`. Use a single-use nonce for vendor URLs.
3. **RLS and service-role misuse (C3):** deny by default, revoke default grants, use `app_metadata` rather than `user_metadata`, and make views `security_invoker`. Run pgTAP "anon returns zero rows" and cross-firm tests before any feature.
4. **Webhooks (C4):** verify Plaid's ES256 JWT and body hash, Truv's HMAC, and DocuSeal's timestamped HMAC on the raw body. Use a unique `(provider, event_key)`, return 200 fast, and reconcile.
5. **Logics writes and wrong-client send (C8, C9):** require the confirm card and a send-time re-fetch. Use a ledger with an `unknown` state, never auto-retry the multipart POST, gate on 6 MB before the click, push serially, and take `FileCategoryID` and `ActivityType` from config.

Also important:
- Plaid statement coverage and the 90-day default (C5, C6).
- FTC Safeguards and WISP duties (C10).
- Retention and `/item/remove` billing (C11).
- PII going to the LLM or logs (C12).
- Persist signed PDFs immediately (C13).
- Workers limits (C14).

## Implications for Roadmap

### Demo path versus everything else (Mon Oct 12 11:30)

**Minimum demo path, using sandbox and synthetic data only:**
1. A deployed Worker and SPA on a real URL, staff sign-in, and RLS with an anon-zero-rows test.
2. A read-only Logics lookup against a fake or test case, with the confirm card.
3. Create a request from a seeded template, copy the link, and have the client open `/c/<token>` to see the firm and agent header and the step list.
4. Client upload through a signed direct upload, staff approve/reject, and dashboard status by polling.
5. Plaid sandbox (`user_good`/`pass_good`) and Truv sandbox (`goodlogin`/`goodpassword`, then `multiple.employments`) with verified webhooks.
6. A minimal Logics push of one small PDF to a test CaseID plus an activity note, behind the flag and allowlist, with a visible ledger row. If write scopes aren't confirmed by demo day, show it against a recorded fake and say so.

**Nice-to-have if time allows:** DocuSeal embedded signing and Smarty address to county.

**Not for the demo (show as "coming next"):**
- The 433-A view and engine port, and Teller.
- Reminders, statement coverage checks and AI classification.
- PDF splitting beyond a single file, virus scan, retention jobs, and the MFA evidence pack.
- Production Plaid/Truv onboarding, Spanish, and the DOB gate (design for it, ship it off).

**Day-one spikes, each under an hour and run in parallel:**
- Vitest 5 with the Workers plugin.
- The `@supabase/server` Hono adapter.
- A signed upload token with TUS from an unauthenticated browser.
- Cloudflare Email Service versus Resend.
- Truv `multiple.employments`.
- Confirm the Logics scopes, and get the `FileCategoryID` and `ActivityType` values from Andrew.

### Suggested phases

**Phase 1: Foundation, security baseline, deploy**
- **Rationale:** Everything depends on it, and webhooks need a public URL.
- **Delivers:**
  - Repo hygiene: fix `.envnode_modules/` in `.gitignore`, untrack `dist/`, raise `engines` to >=22.12.
  - The shadcn-admin fork with Clerk and demo data stripped.
  - Worker skeleton on Workers Paid, with Queue, DLQ and cron.
  - Additive migrations: firms, staff, extended cases, requests, items, links, connections, secrets, webhook_events, logics_pushes, events, consents and retention columns.
  - RLS, grants and RPCs.
  - Staff auth, token and cookie design, logger allowlist, and demo safety flags.
  - The 28-versus-32 reconciliation, and the spikes.
- **Avoids:** C1, C3, C10 (design), C11 (columns), C12, C14, M13.

**Phase 2: Logics read path, request creation, client shell**
- **Delivers:**
  - Logics Find/CaseInfo with header parameters and phone normalization.
  - The confirm card and send-time re-fetch.
  - Seeded templates, contact validation, and copy/resend/revoke.
  - The client shell, session exchange and step list.
  - Rate limits and CSP.
  - The dashboard list.
- **Avoids:** C2, C8, M1, M2, M6.

**Phase 3: Uploads, staff review, audit, live status**
- **Delivers:**
  - Signed TUS uploads with client-side compression, magic-byte checks and HEIC handling.
  - Approve/reject, the events feed, polling status, and Smarty county.
  - The client heartbeat for the mirror view.
  - Mobile accessibility rules.
- **Avoids:** C14, M8, M9, M10, M12.
- **Why it matters:** this is the first vendor-free end-to-end value, which de-risks the demo.

**Phase 4: Webhook/queue/reconcile framework, Truv first, then Plaid**
- **Delivers:**
  - A generic `/api/webhooks/:provider` route with idempotency, a consumer with backoff and DLQ, and a cron reconciler.
  - Truv multi-employer support.
  - Plaid Hosted Link from the portal, encrypted tokens, transactions sync, and statement jobs.
  - Per-account statement status with manual upload.
  - Consent rows, and the capability-based `BankProvider`.
- **Avoids:** C4, C5, C6, C7, C11, M3, M4, M5.

**Phase 5: Logics push (hardened) and PDF normalization**
- **Delivers:**
  - Ledger with an `unknown` resolution UI.
  - `normalizeForLogics` (image to PDF, split to 5.5 MiB, "needs manual compression").
  - A category config table and one activity note per batch.
  - Serial low-concurrency pushes.
- **Avoids:** C9, C14.

**Phase 6: E-signature (DocuSeal)**
- **Delivers:**
  - Submissions with `send_email:false` and an embedded form.
  - A `form.completed` handler that stores the signed PDF and audit PDF with a hash immediately.
  - An ESIGN consent row, and a copyable link.
- **Avoids:** C13, M11. Form scope needs ValorTax counsel/CPA input.

**Phase 7: 433-A engine port and pre-population view**
- **Delivers:**
  - The golden-fixture generator and the TS port with a parity suite.
  - Standards RPC repository.
  - `data_suggestions` with a staff-accept path.
  - The Plaid category to 433-A mapping in SQL and Truv deduction mapping.
  - Source badges, evidence drill-down and worksheet export.
  - Ports of the `document_parse.py` extractors, split to under 500 lines.
- **Avoids:** M7, C12.

**Phase 8: Reminders, Teller, polish**
- **Delivers:**
  - Capped reminders that stop on completion.
  - A stuck alert, and Teller via the mTLS binding (assume no statement PDFs).
  - The DOB gate on by default, reject presets, coverage checks and Realtime.
  - Redacted AI suggestions with ZDR parameters.

**Phase 9: Production gate and hardening**
- **Delivers:**
  - Plaid/Truv production access with a consistent use-case statement.
  - The WISP evidence pack, MFA enforcement and an incident runbook.
  - Retention cron proof, a pen test of the token path, and an accessibility audit.
  - A scanner decision, key rotation, and a real-client pilot.
- **Avoids:** C7, C10, C11, C13, M1, M2, M8.

**Ordering rationale:** Deploy and RLS come before integrations. Uploads and review define the item model that providers plug into. The reconcile framework comes before provider code, and approval semantics come before the Logics push. The 433-A view comes last among v1 features because it consumes everything else. PITFALLS.md tags map as follows: its P1 is Phase 1; P2 is Phases 2 and 5; P3 is Phases 2 and 3; P4 is Phase 4 plus Teller in Phase 8; P5 is Phase 4; P6 is Phase 6; P7 is Phase 7; P8 is Phase 9.

### Research flags
- **Needs `--research-phase`:**
  - Phase 4: Plaid production and Statements, Truv multi-employer, live webhook signing, redirect URI rules.
  - Phase 5: real Logics write behavior and config values, PDF memory limits.
  - Phase 7: 433-A mapping and which forms ValorTax uses, IRC 7216 and redaction.
  - Phase 8 (Teller only): mTLS, statements, signing recipe.
  - Phase 9: legal and compliance scoping, vendor production terms.
- **Standard patterns:** Phases 1, 2 and 3. Phase 6 mechanics are standard but need a business decision on form scope.

## Confidence

| Area | Confidence | Notes |
|---|---|---|
| Stack | HIGH | Read from the npm registry and platform docs today. MEDIUM spikes: Vitest 5 with the Workers plugin, `@supabase/server` on Workers, Cloudflare Email Service. |
| Features | MEDIUM | Repo and IRS facts are first-hand. Competitor claims come from vendor marketing. The 433-A line mapping needs CPA/EA review. |
| Architecture | MEDIUM-HIGH | Vendor mechanics are verified. Client isolation through the service role is first-party design and must be proven with tests. Teller is LOW. |
| Pitfalls | MEDIUM-HIGH | Vendor and regulation text is verified. Legal applicability (7216, state e-sign, TCPA, FTC exemptions) needs counsel. |

**Overall:** MEDIUM-HIGH.

## Gaps to Address
- **Logics:** key scopes (`case.read`, `case.write`, `activity.write`), the `FileCategoryID` list, `ActivityType` values, rate limits, and any non-production tenant. Ask Andrew before Phase 2 ends. Until then, push runs against a fake behind the allowlist.
- **Plaid:** Link Delivery, Statements and Chase access, redirect URI rules, per-Item billing, and the 10-Item trial cap.
- **Truv:** multi-employer behavior and webhook signing, via a sandbox spike.
- **Teller:** statement PDFs, mTLS behavior and signing recipe are all LOW. Assume no statement PDFs.
- **Email provider:** Cloudflare Email Service or Resend, decided by the Phase 1 spike.
- **DocuSeal:** cloud versus unmodified container.
- **E-sign scope:** which forms may be e-signed, and the consent text. 433-A signing stays out of the portal until counsel decides.
- **433-A forms:** which of 433-A, 433-F and OIC ValorTax uses most. Interview Nicole and Sandra before Phase 7.
- **LLM use:** default is no raw documents to OpenRouter. Any use needs a redaction and consent decision and ZDR parameters.
- **Question count:** 28 versus 32.
- **Oversized scanned pages:** a container compressor only if real uploads show the problem.
- **Resale:** get written vendor answers on white-label use before onboarding a second firm.
- **Engine debt after the port:** the hard-coded thresholds remain, and the golden fixtures stand in for the missing `test_determination.py`. Zero-defaults are fixed by `MissingFactError`.

## Sources
- **Primary (HIGH):**
  - npm registry and GitHub API, read 2026-10-10.
  - Cloudflare, Supabase, Plaid, Truv, DocuSeal and Teller docs.
  - `Logics_API_Documentation.docx.md`, 16 CFR 314.4, and IRS Pub 4557/5708.
  - IRS Forms 433-A (Rev. 6-2026), 433-A(OIC) (Rev. 4-2026) and 433-F (Rev. 7-2024).
  - The Plaid category taxonomy CSV and the OpenRouter ZDR docs.
- **Secondary (MEDIUM):** the Truv MSA snippet, the IRM 10.10.1 forms list (recheck before launch), FCC TCPA timing sources, the `@supabase/server` README, the Gather README, and the Cloudflare Python-JS RPC changelog.
- **Tertiary (LOW):** competitor claims from vendor pages and roundups; the Teller statements and signing details; Cloudflare Email Service state; a community mTLS-binding report.

*Research completed: 2026-10-10. Ready for roadmap: yes.*
