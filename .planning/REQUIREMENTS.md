# Requirements: ResSpark

**Defined:** 2026-10-10
**Core Value:** A case manager can send a client one link and get bank statements, pay stubs, and documents back into the Logics case without chasing, babysitting, or re-uploading.

## v1 Requirements

Requirements for the first release. Each maps to a roadmap phase. The Oct 12 2026 demo is a cut across the early phases using sandbox providers and synthetic data only.

### Platform & Security

- [x] **PLAT-01**: App is deployed to a public Cloudflare Workers URL that serves the SPA and the `/api/*` and `/webhooks/*` routes from one deploy
- [x] **PLAT-02**: Every Supabase table the app uses has RLS enabled with deny-by-default grants, and an automated test proves the anon role returns zero rows from every table
- [x] **PLAT-03**: The browser never holds a secret or writes to Postgres directly; every mutation goes through the Worker, and integration credentials exist only as Worker secrets
- [x] **PLAT-04**: Every staff and client action (lookup, send, open, connect, upload, approve, reject, push, sign) writes an event row with actor, timestamp, and case/request id
- [x] **PLAT-05**: Demo safety: a `LOGICS_WRITE_ENABLED` flag, a code-enforced test-CaseID allowlist, and a visible SANDBOX banner make writes to the real Logics tenant impossible when the flag is off
- [x] **PLAT-06**: Repo hygiene: `.gitignore` ignores all `.env` files, `src/frontend/dist/` is untracked, Node engines is `>=22.12`, and one package manager with one lockfile is used
- [x] **PLAT-07**: Staff can sign in with Supabase Auth and stay signed in across refresh; unauthenticated visitors cannot load any `/admin/*` route or read any data
- [x] **PLAT-08**: Logs and error reports never contain client tokens, document bytes, or PII (allowlisted logger fields)

### Logics Lookup

- [ ] **LOOK-01**: Staff can search a Logics case by case ID, phone number, or email and see matching cases (name, phone, email, status) within 3 seconds
- [ ] **LOOK-02**: Staff must confirm a case card ("Is this the right person?") before a request can be created; multiple matches are shown as a list to choose from
- [ ] **LOOK-03**: Phone numbers are normalized before lookup so formats like `(121)121-2121`, `121-121-2121`, and `1211212121` all match
- [ ] **LOOK-04**: Logics case data (name, contact, address, status) is cached on the local case record and re-fetched at send time so a stale match cannot be sent to
- [ ] **LOOK-05**: A firm admin can paste the firm's Logics API key and secret token into a Settings page; they are stored encrypted server-side, never shown again in full, and a "Test connection" button confirms they work before any lookup is allowed

### Request Builder & Link

- [ ] **REQ-01**: Staff can create a request from a seeded template (for example "Standard resolution packet": bank, payroll, address, ID, signature) and add or remove items before sending
- [ ] **REQ-02**: Email and phone are validated before send: non-empty, syntactically valid, and typo domains such as `gmailcom` or `gmial.com` are flagged with a "did you mean" suggestion
- [ ] **REQ-03**: After send, staff see a copyable client link; the link is HMAC-signed and unguessable, expires (default 14 days), and can be revoked or regenerated without changing the request
- [ ] **REQ-04**: Staff can send the link by email from the app and see the delivery result; sending by text is a copy-to-clipboard action the agent completes from their own phone
- [ ] **REQ-05**: Staff can record "client agreed to be texted" on the request and the consent is written to the event log

### Client Portal

- [ ] **PORT-01**: Client opens the link on a phone with no account, password, or app and sees the firm name, the agent's name, and what is being requested
- [ ] **PORT-02**: The first page load exchanges the token for an HttpOnly cookie and strips the token from the URL; opening the link does not mark the request "opened" until the client taps Start
- [ ] **PORT-03**: Client sees a step list (connect bank, connect payroll, confirm address, upload documents, sign) with done and not-done state and can complete steps in any order
- [ ] **PORT-04**: Progress is saved per step, so closing the tab and reopening the link resumes where the client left off
- [ ] **PORT-05**: Portal pages are mobile-first, meet WCAG 2.2 AA basics (44 px targets, contrast, labels), send no-referrer, no-store, and noindex headers, and load no analytics or session replay
- [ ] **PORT-06**: Expired or revoked links show an "ask your agent for a new link" page, and token guessing is rate-limited per IP

### Uploads & Review

- [ ] **UPL-01**: Client can upload one or more files per requested item by drag-drop, file picker, or camera, with per-file progress and resumable uploads direct to Supabase Storage
- [ ] **UPL-02**: Uploads are validated by magic bytes (PDF, JPG, PNG, HEIC) and size limits, and images are compressed client-side before upload
- [ ] **UPL-03**: Staff see each uploaded item with preview and download via short-lived signed URLs and can approve it or reject it with a note; a rejected item returns to the client's step list with the note visible
- [ ] **UPL-04**: An item is complete only when staff approve it, and the request is complete when every required item is approved

### Status & Dashboard

- [ ] **STAT-01**: Admin dashboard lists requests with status (sent, opened, in progress, waiting on staff, complete), age, and overdue flags, sortable and filterable
- [ ] **STAT-02**: Request and case status update on the dashboard and case view without a manual reload (polling every 5-10 seconds while the tab is visible)
- [ ] **STAT-03**: Staff see a mirror of the client's current step and last error, driven by a client heartbeat, so they can guide the client on the phone
- [ ] **STAT-04**: The case view shows an event timeline (who did what, when) including provider webhook events

### Bank Connection

- [ ] **BANK-01**: Client can connect a bank via Plaid Hosted Link opened from the portal step; a fresh link token is created per tap with `transactions.days_requested` of at least 200 and Statements requested where the bank supports it
- [ ] **BANK-02**: After connection the system exchanges the public token, stores the access token encrypted, syncs 6 months of transactions, and downloads every available monthly statement PDF into the case
- [ ] **BANK-03**: Each connected account shows statement status by month (available, not supported by this bank, uploaded manually) and offers manual statement upload as a first-class fallback
- [ ] **BANK-04**: Bank data is retrieved through a `BankProvider` interface with declared capabilities so a second provider can be enabled by configuration; Plaid is the first implementation
- [ ] **BANK-05**: Client sees and accepts a consent screen stating what will be pulled and why (tax paperwork preparation) before Plaid opens, and the consent is logged
- [ ] **BANK-06**: Plaid Items are removed after a configurable window (default 30 days) so per-Item billing stops

### Payroll Connection

- [ ] **PAY-01**: Client can connect payroll via a Truv order (income and employment) opened from the portal step, and can add more than one employer in the same order
- [ ] **PAY-02**: After completion the system retrieves the income and employment report, pay stubs, and W-2s into the case, attributed to each employer
- [ ] **PAY-03**: A client who cannot find their employer or provider can upload pay stubs and W-2s manually in the same step
- [ ] **PAY-04**: Truv order status (pending, connected, done, error) is reflected in the client step and the admin status

### Address

- [ ] **ADDR-01**: Client confirms their home address with Smarty autocomplete, and the selected USPS-validated address, county, and residential or commercial flag are stored on the case
- [ ] **ADDR-02**: The stored county feeds the IRS local standards lookup so staff never pick a county from a dropdown

### E-Signature

- [ ] **SIGN-01**: Staff can attach an e-sign template (engagement letter, Form 2848, Form 8821) to a request, and the client signs it embedded in the portal step on a phone; the provider is DocuSeal first, with Anvil evaluated against the same acceptance test
- [ ] **SIGN-02**: On completion the signed PDF and the audit-trail PDF are stored in the case immediately with a content hash, the item is marked signed, and the signed PDF can be pushed to Logics like any other document
- [ ] **SIGN-03**: Staff get a copyable signing link, and an ESIGN consent record is captured before the client signs
- [ ] **SIGN-04**: The signing experience passes the "senior on the phone" test: after opening the link on a phone the client reaches the first signature field in at most 3 taps with no pinch-zoom or horizontal scrolling, and the agent can see which step the client is on

### Logics Push

- [ ] **PUSH-01**: Staff can select approved items and push them to the Logics case as Case Documents with a comment and a configurable FileCategoryID; a local ledger records queued, sending, sent, failed, or unknown per file
- [ ] **PUSH-02**: Files over 6 MB are normalized before push (images to PDF, PDFs split into parts of at most 5.5 MiB) or flagged "needs manual compression"; nothing over 6 MB is ever sent
- [ ] **PUSH-03**: One activity note per push batch is written to the Logics case naming the agent and the documents uploaded
- [ ] **PUSH-04**: Pushes are never blindly retried; an `unknown` result requires a staff decision in the UI so Logics never receives duplicate documents

### Webhooks & Reconciliation

- [ ] **WEBH-01**: Plaid, Truv, and DocuSeal webhooks are signature-verified on the raw body, stored idempotently by provider and event key, acknowledged within one second, and processed by a queue consumer with retries and a dead-letter queue
- [ ] **WEBH-02**: A cron reconciler and a staff Refresh button re-read provider state so a missed webhook never leaves a request stuck
- [ ] **WEBH-03**: Status transitions are monotonic, so an out-of-order event can never move a step from done back to pending

### 433-A Pre-population & Intake

- [x] **FORM-01**: The determination engine is ported to TypeScript with golden fixtures generated from the existing Python tests; the parity suite passes with identical outputs and no constant changed
- [ ] **FORM-02**: Client can answer the intake questions (existing contract, reconciled against the 28 rows in `question_definitions`) in the redesigned portal, pre-filled from connected data and Logics case data where available
- [ ] **FORM-03**: Staff see a 433-A pre-population view of income, expenses, and assets with source badges (Truv, Plaid, intake, Logics), proposed versus confirmed values, and evidence drill-down to the transaction or pay stub
- [ ] **FORM-04**: Staff can accept or edit each proposed value; only accepted values enter `case_financial_data`, and unknown values stay null
- [ ] **FORM-05**: IRS standards for the client's county are applied and the engine's recommendation (OIC, installment, CNC, manual review) with its math is visible to staff
- [ ] **FORM-06**: Staff can export the worksheet as a PDF labeled "Not an IRS form" and push it to Logics like any other document
- [ ] **FORM-07**: The Plaid-category-to-433-A-line mapping and the Truv deduction mapping live in SQL tables, not in code

### Reminders & Second Provider

- [ ] **REM-01**: Automated email reminders (at most 3, configurable cadence) stop automatically when the request is complete or revoked
- [ ] **REM-02**: Staff get a "stuck client" alert when a client has not progressed for a configurable number of hours after opening
- [ ] **REM-03**: Teller is available as a second bank provider behind the `BankProvider` interface (transactions only), enabled by configuration
- [ ] **REM-04**: An optional identity gate (date of birth or last four of phone) protects the client link and is on by default

### Production Readiness

- [ ] **PROD-01**: Plaid and Truv production access is configured with a consistent use-case statement, consent screen, and privacy policy
- [ ] **PROD-02**: Staff MFA is enforced and a WISP evidence pack (access log, encryption, retention, incident runbook) is produced
- [ ] **PROD-03**: Documents and provider connections are purged per a configurable retention policy (default 2 years) with the audit record kept
- [ ] **PROD-04**: AI document classification (OpenRouter) runs only on redacted text with zero-data-retention parameters and produces suggestions staff must confirm

## v2 Requirements

Deferred to a later release. Tracked but not in the current roadmap.

### Forms & Localization

- **FORMV2-01**: 433-F and 433-A(OIC) layouts as alternate views of the same data
- **FORMV2-02**: Spanish localization of the client portal

### Platform

- **PLATV2-01**: Multi-tenant white-label for other firms (firm branding, separate Logics tenants)
- **PLATV2-02**: Logics polling that auto-creates requests when a case reaches a given status
- **PLATV2-03**: Supabase Realtime for dashboard updates in place of polling
- **PLATV2-04**: Virus scanning of uploads through a scanning service
- **PLATV2-05**: Official IRS form PDF generation (only if a firm asks)
- **PLATV2-06**: PostHog product analytics on staff pages only (never on client pages)
- **PLATV2-07**: E-sign as a standalone offering firms can use in place of the Logics e-sign (generate, send, collect, file back into the case)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Own SMS sending (Twilio-style) | No provider key; TCPA and 10DLC lead time; copyable link and provider-sent SMS cover the demo |
| Replacing IRS Logics as the CRM | Logics stays the system of record; we read cases and write documents and notes |
| AI resolution-strategy report from IRS transcripts | Zack chose to solve document collection first |
| Email-attachment-to-Logics automation | Andrew is building this separately |
| Stripe Identity and voice-verified signing | Belongs to Zack's other product |
| Native mobile apps | Mobile-first web portal is sufficient |
| Session replay or analytics on client pages | Pages show bank, SSN, and address data |
| AI auto-approval or LLM inside the determination math | CLAUDE.md: determination stays deterministic |
| Signing the official Form 433-A inside the portal | IRM 10.10.1 does not list 433-A as e-signature accepted; needs ValorTax counsel |
| Plaid credit or consumer-lending products | Andrew declined the annual contract; Transactions and Statements only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 1 | Complete |
| PLAT-02 | Phase 1 | Complete |
| PLAT-03 | Phase 1 | Complete |
| PLAT-04 | Phase 1 | Complete |
| PLAT-05 | Phase 1 | Complete |
| PLAT-06 | Phase 1 | Complete |
| PLAT-07 | Phase 1 | Complete |
| PLAT-08 | Phase 1 | Complete |
| LOOK-01 | Phase 2 | Pending |
| LOOK-02 | Phase 2 | Pending |
| LOOK-03 | Phase 2 | Pending |
| LOOK-04 | Phase 2 | Pending |
| LOOK-05 | Phase 2 | Pending |
| REQ-01 | Phase 2 | Pending |
| REQ-02 | Phase 2 | Pending |
| REQ-03 | Phase 2 | Pending |
| REQ-04 | Phase 2 | Pending |
| REQ-05 | Phase 2 | Pending |
| PORT-01 | Phase 2 | Pending |
| PORT-02 | Phase 2 | Pending |
| PORT-03 | Phase 2 | Pending |
| PORT-04 | Phase 2 | Pending |
| PORT-05 | Phase 2 | Pending |
| PORT-06 | Phase 2 | Pending |
| UPL-01 | Phase 3 | Pending |
| UPL-02 | Phase 3 | Pending |
| UPL-03 | Phase 3 | Pending |
| UPL-04 | Phase 3 | Pending |
| STAT-01 | Phase 3 | Pending |
| STAT-02 | Phase 3 | Pending |
| STAT-03 | Phase 3 | Pending |
| STAT-04 | Phase 3 | Pending |
| BANK-01 | Phase 4 | Pending |
| BANK-02 | Phase 4 | Pending |
| BANK-03 | Phase 4 | Pending |
| BANK-04 | Phase 4 | Pending |
| BANK-05 | Phase 4 | Pending |
| BANK-06 | Phase 4 | Pending |
| PAY-01 | Phase 4 | Pending |
| PAY-02 | Phase 4 | Pending |
| PAY-03 | Phase 4 | Pending |
| PAY-04 | Phase 4 | Pending |
| ADDR-01 | Phase 6 | Pending |
| ADDR-02 | Phase 7 | Pending |
| SIGN-01 | Phase 6 | Pending |
| SIGN-02 | Phase 6 | Pending |
| SIGN-03 | Phase 6 | Pending |
| SIGN-04 | Phase 6 | Pending |
| PUSH-01 | Phase 5 | Pending |
| PUSH-02 | Phase 5 | Pending |
| PUSH-03 | Phase 5 | Pending |
| PUSH-04 | Phase 5 | Pending |
| WEBH-01 | Phase 4 | Pending |
| WEBH-02 | Phase 4 | Pending |
| WEBH-03 | Phase 4 | Pending |
| FORM-01 | Phase 7 | Complete |
| FORM-02 | Phase 7 | Pending |
| FORM-03 | Phase 7 | Pending |
| FORM-04 | Phase 7 | Pending |
| FORM-05 | Phase 7 | Pending |
| FORM-06 | Phase 7 | Pending |
| FORM-07 | Phase 7 | Pending |
| REM-01 | Phase 8 | Pending |
| REM-02 | Phase 8 | Pending |
| REM-03 | Phase 8 | Pending |
| REM-04 | Phase 8 | Pending |
| PROD-01 | Phase 8 | Pending |
| PROD-02 | Phase 8 | Pending |
| PROD-03 | Phase 8 | Pending |
| PROD-04 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 70 total
- Mapped to phases: 70
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-10*
*Last updated: 2026-10-10 after roadmap creation (traceability filled; v1 count corrected from 62 to 70)*
