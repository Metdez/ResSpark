# Roadmap: ResSpark

## Overview

ResSpark lets a tax-resolution case manager send a client one link and get bank statements, pay stubs, and documents back into the IRS Logics case without chasing or re-uploading. The journey runs in the order Andrew described it: staff sign in on a real deployed URL (Phase 1), find a Logics case and send a link the client opens on a phone (Phase 2), the client uploads and staff review with live status (Phase 3), the client connects payroll and bank and the data lands in the case (Phase 4), approved documents are pushed into Logics (Phase 5), the client confirms an address and e-signs (Phase 6), the existing screening engine becomes a 433-A pre-population view (Phase 7), and the platform gains reminders, a second bank provider, and the security and compliance work needed for real clients (Phase 8). Every phase ships something a person can use end to end, and the hard deadline (a working demo on Mon Oct 12 2026 at 11:30) is met by Phases 1 through 5 using sandbox providers and synthetic cases.

## Demo Cut (Mon Oct 12 2026, 11:30)

- **Demo path:** Phases 1 through 5, on sandbox providers (Plaid `user_good`, Truv `goodlogin`, then `multiple.employments`) and fake or test cases only. Never the real ValorTax tenant with real client data.
- **Nice-to-have:** Phase 6 (Smarty address and DocuSeal signing). Show it if it lands; otherwise present it as "coming next".
- **Show as "coming next":** Phase 7 (433-A view) and Phase 8 (reminders, Teller, production gate).
- **Phase 5 demo slice:** one small PDF pushed to a test CaseID with an activity note and a visible ledger row, behind `LOGICS_WRITE_ENABLED` and the allowlist. If Logics write scopes are not confirmed by demo day, run the push against a recorded fake and say so.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Staff Sign-In** - Staff sign in at a real Cloudflare URL on a locked-down, sandbox-safe base
- [ ] **Phase 2: Find the Client & Send the Link** - Look up a Logics case, confirm it, build a request, copy a link, and the client opens it on a phone
- [ ] **Phase 3: Uploads, Review & Live Status** - Client uploads from a phone, staff approve or reject, and everyone sees live status
- [ ] **Phase 4: Connect Payroll & Bank** - Client connects Truv payroll and Plaid bank; statements, pay stubs, and W-2s land in the case with reliable webhooks
- [ ] **Phase 5: Push to Logics** - Staff push approved documents into the Logics case with a ledger, an activity note, and no duplicates
- [ ] **Phase 6: Address & E-Sign** - Client confirms a USPS-validated address and signs forms from the same link
- [ ] **Phase 7: 433-A Pre-Population** - Staff review a 433-A worksheet pre-filled from connected data with IRS standards and the engine's recommendation
- [ ] **Phase 8: Reminders, Teller & Production Readiness** - Automated nudges, a second bank provider, an identity gate, and the compliance work for real clients

## Phase Details

### Phase 1: Foundation & Staff Sign-In

**Goal:** As a ValorTax case manager, I want to sign in to ResSpark at a real public URL on a secure, sandbox-safe base, so that every later feature ships on a deployed foundation where no data is reachable without auth and nothing can write to the real Logics tenant by accident.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, PLAT-06, PLAT-07, PLAT-08
**Success Criteria** (what must be TRUE):
  1. Anyone can open the public Cloudflare URL; staff sign in with Supabase Auth and stay signed in after a refresh, while a visitor who is not signed in cannot load any `/admin/*` page or read any data (PLAT-01, PLAT-07)
  2. A signed-in staff member lands in the new admin shell (sidebar and an empty dashboard) under a visible SANDBOX banner, and with `LOGICS_WRITE_ENABLED` off, any attempted write to a CaseID outside the test allowlist is refused in code (PLAT-05)
  3. An automated test proves the anon role returns zero rows from every table, the browser bundle holds no secret, and every change goes through the Worker rather than directly to Postgres (PLAT-02, PLAT-03)
  4. Signing in and signing out each appear as an event row with actor, timestamp, and id, on the same event-writing path every later phase's actions must use (PLAT-04)
  5. A fresh clone ignores every `.env` file, tracks no `dist/` folder, uses one package manager and one lockfile on Node 22.12 or newer, and a failed request's log line contains no tokens, document bytes, or PII (PLAT-06, PLAT-08)

**Plans:** 1/8 plans executed

Plans:
- [x] 01-01-PLAN.md — Repo hygiene first: `.gitignore`, pnpm workspace, engines, 500-line gate, hygiene-check (PLAT-06)
- [ ] 01-02-PLAN.md — Fork shadcn-admin@e16c87f into `app/`, strip Clerk/axios/faker, `/admin/*` route tree, pinned deps, design-system pass
- [ ] 01-03-PLAN.md — Hono Worker + first deploy to workers.dev, allowlisted logger, `logicsWriteGuard`, SANDBOX banner, spike (a) (PLAT-01, PLAT-05, PLAT-08)
- [ ] 01-04-PLAN.md — Migration 0002 applied via Management API [BLOCKING], RLS/grants proof (strict 401), question reconciliation (PLAT-02, PLAT-04)
- [ ] 01-05-PLAN.md — Worker secrets over stdin, `db/` module (`createAdminClient`, `logEvent`, `getStaffProfile`), two demo staff users, sign-up disabled (PLAT-03, PLAT-04, PLAT-07)
- [ ] 01-06-PLAN.md — `jose` JWT verification, `/api/admin/session` events, SPA sign-in / guard / sign-out, authenticated smoke (PLAT-04, PLAT-07)
- [ ] 01-07-PLAN.md — Client-link HMAC token + signed-cookie exchange, uniform 404, per-IP rate limit, `/c/` client shell (PLAT-08, PLAT-07)
- [ ] 01-08-PLAN.md — Spikes (c) and (e) run, (a)(b)(d)(f) recorded, reserved secret names, operator README

**Scope notes**: New React + Vite + shadcn SPA forked from `satnaing/shadcn-admin` (Clerk, axios, faker stripped) with two route trees (`/admin/*`, `/c/:token`); Hono Worker on Workers Paid with Queue, DLQ, and cron, serving the SPA and API from one deploy; additive Supabase migrations only (the 0001 baseline is already applied) for firms, staff, cases, requests, items, links, connections, secrets, webhook_events, logics_pushes, events, consents, and retention columns, with RLS, grants, and RPCs; HMAC token and HttpOnly-cookie design; reconcile the 28 versus 32 question count; run the day-one spikes (Vitest 5 with the Workers plugin, `@supabase/server` Hono adapter, signed TUS upload from an unauthenticated browser, Cloudflare Email versus Resend, Truv `multiple.employments`, and confirming Logics scopes plus `FileCategoryID` and `ActivityType` values with Andrew).
**UI hint**: yes

### Phase 2: Find the Client & Send the Link

**Goal:** As a ValorTax case manager, I want to type a phone number, case ID, or email, confirm the matching Logics case, and copy a request link that the client opens on a phone, so that I can get a client started in under a minute while still on the call.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: LOOK-01, LOOK-02, LOOK-03, LOOK-04, LOOK-05, REQ-01, REQ-02, REQ-03, REQ-04, REQ-05, PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06
**Success Criteria** (what must be TRUE):
  1. After a firm admin pastes the Logics API key and secret token into Settings and "Test connection" succeeds (the secret is never shown again in full), staff type a case ID, a phone number in any format (`(121)121-2121`, `121-121-2121`, `1211212121`), or an email and see the matching case's name, phone, email, and status within 3 seconds; with several matches they choose from a list, and nothing can be sent until they confirm "Is this the right person?" (LOOK-05, LOOK-01, LOOK-02, LOOK-03)
  2. Staff start from a seeded template such as "Standard resolution packet", add or remove items, and an empty or typo'd email or phone (for example `gmailcom` or `gmial.com`) is flagged with a "did you mean" suggestion; at send time the case is re-fetched from Logics so a stale match cannot be sent to (REQ-01, REQ-02, LOOK-04)
  3. After send, staff see a copyable client link that expires (default 14 days) and can be revoked or regenerated without changing the request, can email it from the app and see the delivery result, and can record "client agreed to be texted" in the event log; from typing a phone number to holding a copyable link takes under a minute (REQ-03, REQ-04, REQ-05)
  4. A client opens the link on a phone with no account, password, or app and sees the firm name, the agent's name, and a simple step list (connect bank, connect payroll, confirm address, upload documents, sign) with done and not-done state; the request counts as "opened" only after the client taps Start, closing and reopening the link resumes where they left off, and an expired or revoked link says "ask your agent for a new link" (PORT-01, PORT-02, PORT-03, PORT-04, PORT-06)
  5. Portal pages are mobile-first with 44 px targets and readable contrast, send no-referrer, no-store, and noindex headers, load no analytics or session replay, and repeated token guessing is rate-limited per IP (PORT-05, PORT-06)

**Plans:** 8 plans

Plans:
- [ ] 02-01-PLAN.md — [BLOCKING] Migration `0003_requests` (firm_integrations, templates, requests, items, client_sessions, cases columns, six RPCs, RLS) applied + live RPC lifecycle proof (LOOK-04, LOOK-05, REQ-01, REQ-03, PORT-02, PORT-04)
- [ ] 02-02-PLAN.md — Logics read module: header-auth fetch client, defensive mapper, fixture client, lookup with phone normalization + retry; shared `contact.ts` validation; AES-GCM credential crypto + fake/live resolver (LOOK-01..03, LOOK-05, REQ-02)
- [ ] 02-03-PLAN.md — Worker admin routes: lookup + confirm (CaseInfo re-fetch → `case_confirm_logics`), Logics credentials GET/PUT/test; `INTEGRATION_ENC_KEY`, `LOGICS_MODE=fake`, `RESEND_FROM`; deploy + smoke (LOOK-01, LOOK-02, LOOK-04, LOOK-05)
- [ ] 02-04-PLAN.md — Worker request routes: templates, create, send (contact gate + Logics re-fetch + `request_send` + minted URL), regenerate/revoke, Resend email, consent, link-copied (REQ-01..05, LOOK-04)
- [ ] 02-05-PLAN.md — SPA staff flow: request page (send + copy link), builder, Find a client with confirm cards; status badge palette; sidebar entry (LOOK-01..03, REQ-01..03)
- [ ] 02-06-PLAN.md — SPA link actions (email/regenerate/revoke/consent), requests list, Settings → Integrations (Logics credentials + Test connection), nav + dashboard CTA (REQ-03..05, LOOK-05)
- [ ] 02-07-PLAN.md — Worker client portal: `clientSession` cookie middleware, `/api/c/state|start|heartbeat`, CSRF header, per-link rate limit, privacy headers (PORT-01..06)
- [ ] 02-08-PLAN.md — SPA client portal: intro + Start, step list with chips and Coming next sheets, heartbeat, invalid-link fallback; `smoke --client-flow` deployed proof; demo script (PORT-01..06)
**Scope notes**: Logics Find endpoints and `Case/CaseInfo` with header authentication; case data cached locally; HMAC-signed link, cookie exchange, and token stripped from the URL; ask Andrew for Logics key scopes, `FileCategoryID` list, and `ActivityType` values before this phase ends.
**UI hint**: yes

### Phase 3: Uploads, Review & Live Status

**Goal:** As a ValorTax case manager, I want to review what clients upload from their phones and watch status update live, so that I can approve or reject each item without chasing anyone.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: UPL-01, UPL-02, UPL-03, UPL-04, STAT-01, STAT-02, STAT-03, STAT-04
**Success Criteria** (what must be TRUE):
  1. A client uploads one or more files per requested item from the camera roll, camera, or drag-drop, sees per-file progress, and an interrupted upload resumes after a reload; files that are not PDF, JPG, PNG, or HEIC are refused and large photos are shrunk before upload (UPL-01, UPL-02)
  2. Staff open a case, preview or download each upload through a short-lived link, and approve it or reject it with a note; a rejected item returns to the client's step list with the note visible, an item is complete only when staff approve it, and the request is complete when every required item is approved (UPL-03, UPL-04)
  3. The admin dashboard lists requests with status (sent, opened, in progress, waiting on staff, complete), age, and overdue flags, sortable and filterable, and a request moves from "in progress" to "done" on screen within 5 to 10 seconds with no manual reload while the tab is visible (STAT-01, STAT-02)
  4. Staff can see which step the client is on and the last error the client hit, so they can say on the phone "are you on this step?" (STAT-03)
  5. The case view shows a timeline of who did what and when (lookup, send, open, upload, approve, reject), and provider webhook events join the same timeline once the providers arrive in Phase 4 (STAT-04)

**Plans:** 5 plans

Plans:
- [ ] 03-01-PLAN.md — [BLOCKING] Migration 0004 (documents columns, `case-documents` bucket, `request_status()`, review RPCs, dashboard view) + signed-upload mint/complete routes with magic-byte check, proven live (UPL-01, UPL-02, UPL-04)
- [ ] 03-02-PLAN.md — Client upload step: accept rules, Canvas resize + lazy HEIC + SHA-256, TUS-or-PUT transport per spike (c), mobile sheet with progress/rejected states wired into the step list (UPL-01, UPL-02, UPL-03)
- [ ] 03-03-PLAN.md — Staff review: `/review`, signed preview/download URLs, approve/reject RPC routes, `/cases/:id/events`, `StatusBadge`/`pollInterval`/`ago`, review panel + reject dialog on the request page with 5 s poll (UPL-03, UPL-04, STAT-02)
- [ ] 03-04-PLAN.md — Dashboard: `GET /api/admin/requests?status=&q=` over `request_dashboard_v` + TanStack Table with chips, search, sorting, overdue badges, visibility-aware polling (STAT-01, STAT-02)
- [ ] 03-05-PLAN.md — Client mirror card with 10-minute stuck hint and the case timeline with labels, actor badges, and `Load older` paging (STAT-03, STAT-04)

**Scope notes**: Worker-minted signed TUS uploads direct to Supabase Storage (bytes never touch the Worker), client-side image compression, magic-byte checks, HEIC handling; polling rather than Realtime for the demo.
**UI hint**: yes

### Phase 4: Connect Payroll & Bank

**Goal:** As a tax-resolution client, I want to connect my payroll and my bank from the link on my phone, so that my pay stubs, W-2s, and 6 months of bank statements reach my case manager without me hunting for documents.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: WEBH-01, WEBH-02, WEBH-03, PAY-01, PAY-02, PAY-03, PAY-04, BANK-01, BANK-02, BANK-03, BANK-04, BANK-05, BANK-06
**Success Criteria** (what must be TRUE):
  1. A client taps "Connect payroll", completes the Truv sandbox flow with more than one employer ("if they have two jobs, one 1099... switched jobs two years ago, we need those"), and staff see the income and employment report, pay stubs, and W-2s attributed to each employer, with pending, connected, done, or error shown in both the client step and the admin status; a client who cannot find their employer uploads stubs and W-2s manually in the same step (PAY-01, PAY-02, PAY-03, PAY-04)
  2. Before Plaid opens, the client sees and accepts a consent screen stating what will be pulled and why, then connects a bank in Plaid Hosted Link opened from the portal step; each tap creates a fresh link token and the consent is logged (BANK-05, BANK-01)
  3. After connecting, staff see 6 months of transactions and every available monthly statement PDF in the case, with the last 3 months and the full 6 visible, and each account shows statement status by month (available, not supported by this bank, uploaded manually) with manual statement upload as a first-class fallback (BANK-02, BANK-03)
  4. Plaid and Truv webhooks are signature-verified on the raw body, stored once per event, and acknowledged within a second, then processed with retries and a dead-letter queue; a missed or out-of-order webhook never leaves a request stuck or moves a step from done back to pending, because a cron reconciler and a staff Refresh button re-read provider state (WEBH-01, WEBH-02, WEBH-03)
  5. Bank data flows through a `BankProvider` interface with declared capabilities so a second provider is a configuration change, and Plaid Items older than the configured window (default 30 days) are removed so per-Item billing stops (BANK-04, BANK-06)

**Plans**: TBD
**Scope notes**: Plaid Hosted Link opened from our own portal button (not Plaid-sent SMS or email Link Delivery); `transactions.days_requested` of 200 or more because it cannot change later; `statements` in `required_if_supported_products`; access tokens encrypted; plain `fetch` provider clients (no `plaid` npm package); the generic `/api/webhooks/:provider` route also takes the DocuSeal verifier in Phase 6.
**UI hint**: yes
**Research hint**: yes

### Phase 5: Push to Logics

**Goal:** As a ValorTax case manager, I want to push approved documents into the client's Logics case with one click, so that the file is complete in the system of record without downloading and re-uploading by hand.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: PUSH-01, PUSH-02, PUSH-03, PUSH-04
**Success Criteria** (what must be TRUE):
  1. Staff select approved items and push them to the Logics case with a comment such as "uploaded by ResSpark, last ran by {agent}" and the configured file category, and a ledger on the case shows each file as queued, sending, sent, failed, or unknown; with `LOGICS_WRITE_ENABLED` off or a CaseID outside the allowlist the push is refused with a clear message (PUSH-01, PLAT-05 enforced)
  2. One activity note per push batch appears on the Logics case naming the agent and the documents uploaded (PUSH-03)
  3. A file over 6 MB is converted to PDF or split into parts of at most 5.5 MiB, or flagged "needs manual compression" before the click; nothing over 6 MB is ever sent (PUSH-02)
  4. When Logics gives no clear answer, the file shows "unknown" and the UI asks staff to decide (check Logics, mark sent, or retry); a push is never blindly retried, so Logics never receives duplicate documents (PUSH-04)

**Plans**: TBD
**Scope notes**: Local ledger because Logics cannot list documents; serial, low-concurrency pushes; `FileCategoryID` and `ActivityType` taken from a config table; PDF work (`@cantoo/pdf-lib`, `unpdf`) runs in the Queue consumer; until Andrew confirms write scopes, push is exercised against a fake behind the allowlist.
**UI hint**: yes
**Research hint**: yes

### Phase 6: Address & E-Sign

**Goal:** As a tax-resolution client, I want to confirm my address and sign my forms on my phone from the same link, so that I am done without zooming, scrolling, or waiting on an email.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: ADDR-01, SIGN-01, SIGN-02, SIGN-03, SIGN-04
**Success Criteria** (what must be TRUE):
  1. A client types the start of their home address, picks a USPS-validated suggestion, and staff see the address, county, and residential or commercial flag on the case, with no county dropdown anywhere (ADDR-01)
  2. Staff attach a template (engagement letter, Form 2848, Form 8821) to a request and the client signs it embedded in the portal step on a phone (SIGN-01)
  3. After opening the link on a phone, the client reaches the first signature field in at most 3 taps with no pinch-zoom or horizontal scrolling, and the agent can see which step the client is on; this is the "senior on the phone" test (SIGN-04)
  4. Staff get a copyable signing link (not just an email) and an ESIGN consent record is captured before the client signs (SIGN-03)
  5. On completion the signed PDF and the audit-trail PDF are stored in the case immediately with a content hash, the item shows as signed, and the signed PDF can be pushed to Logics like any other document (SIGN-02)

**Plans**: TBD
**Scope notes**: Smarty US Autocomplete Pro; DocuSeal used as a service (cloud API or unmodified container, never forked because it is AGPL) with Anvil evaluated against the same acceptance test; DocuSeal `form.completed` verifier plugs into the Phase 4 webhook route; which forms may be e-signed needs ValorTax counsel input, and the official Form 433-A is not signed in the portal.
**UI hint**: yes

### Phase 7: 433-A Pre-Population

**Goal:** As a ValorTax settlement officer, I want to review a 433-A worksheet pre-filled from connected bank, payroll, intake, and Logics data with IRS standards for the client's county, so that I only confirm values and read the recommendation instead of retyping the form.
**Mode:** mvp
**Depends on**: Phase 4, Phase 5, Phase 6
**Requirements**: FORM-01, FORM-02, FORM-03, FORM-04, FORM-05, FORM-06, FORM-07, ADDR-02
**Success Criteria** (what must be TRUE):
  1. A client answers the intake questions in the redesigned portal with answers pre-filled from connected data and Logics case data, and the question count is reconciled against the 28 rows in `question_definitions` (FORM-02)
  2. Staff open the 433-A view and see income, expenses, and assets pre-filled with source badges (Truv, Plaid, intake, Logics), proposed versus confirmed values, and a drill-down from any figure to the transaction or pay stub behind it (FORM-03, FORM-07)
  3. Staff accept or edit each proposed value; only accepted values enter `case_financial_data`, and an unknown value stays unknown and blocks evaluation instead of defaulting to zero (FORM-04)
  4. IRS standards for the county from the client's confirmed address are applied with no county dropdown, and the engine's recommendation (OIC, installment, CNC, or manual review) is shown with its math; the TypeScript engine matches the Python tests on golden fixtures with no constant changed (FORM-01, FORM-05, ADDR-02)
  5. Staff export the worksheet as a PDF labeled "Not an IRS form" and push it to Logics like any other document (FORM-06)

**Plans**: TBD
**Scope notes**: Mechanical TypeScript port of `src/determination.py` with Python kept as the test oracle; thresholds and formulas unchanged (any change needs an authoritative source and tests); standards through Postgres RPC functions; Plaid-category-to-433-A-line and Truv deduction mappings in SQL tables; interview Nicole and Sandra on the layout before planning; port the `document_parse.py` extractors split under 500 lines.
**UI hint**: yes
**Research hint**: yes

### Phase 8: Reminders, Teller & Production Readiness

**Goal:** As a ValorTax case manager, I want to nudge clients automatically, offer a cheaper second bank option, and run on a platform that meets security and vendor requirements, so that ResSpark can move from the demo to live ValorTax cases.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: REM-01, REM-02, REM-03, REM-04, PROD-01, PROD-02, PROD-03, PROD-04
**Success Criteria** (what must be TRUE):
  1. A client who goes quiet gets at most 3 reminder emails on the configured cadence that stop automatically when the request is complete or revoked, and staff see a "stuck client" alert when a client has not progressed for the configured number of hours after opening (REM-01, REM-02)
  2. The client link asks for a date of birth or the last four of the phone number before showing anything, and this identity gate is on by default (REM-04)
  3. Staff switch the bank provider from Plaid to Teller with one configuration change and a client can connect a bank through Teller, transactions only (REM-03)
  4. Staff sign-in requires MFA, a WISP evidence pack (access log, encryption, retention, incident runbook) can be produced, and documents and provider connections past the retention window (default 2 years) are purged while the audit record stays (PROD-02, PROD-03)
  5. Plaid and Truv production access is configured with a consistent use-case statement, consent screen, and privacy policy, and AI document classification runs only on redacted text with zero-data-retention parameters and produces suggestions that staff must confirm (PROD-01, PROD-04)

**Plans**: TBD
**Scope notes**: Teller via the mTLS binding (assume no statement PDFs); Plaid compliance framed as tax preparation and tax paperwork help; legal scoping (IRC 7216, FTC Safeguards, TCPA) needs counsel; reminders are email only, there is no own SMS in v1.
**UI hint**: yes
**Research hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Staff Sign-In | 1/8 | In Progress | - |
| 2. Find the Client & Send the Link | 0/8 | Planned | - |
| 3. Uploads, Review & Live Status | 0/TBD | Not started | - |
| 4. Connect Payroll & Bank | 0/TBD | Not started | - |
| 5. Push to Logics | 0/TBD | Not started | - |
| 6. Address & E-Sign | 0/TBD | Not started | - |
| 7. 433-A Pre-Population | 0/TBD | Not started | - |
| 8. Reminders, Teller & Production Readiness | 0/TBD | Not started | - |
