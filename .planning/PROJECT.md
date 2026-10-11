# ResSpark — Tax Resolution Intake & Document Collection Platform

## What This Is

ResSpark is a two-sided web platform for tax-resolution firms (first customer: ValorTax, who use IRS Logics as their case CRM). Staff log in to an admin portal, look up an existing Logics case by case ID, phone, or email, confirm the client, and send the client a link. The client opens that link on their phone with no account or password, and in a guided flow connects their bank (Plaid, with Teller as a drop-in alternative), connects their payroll provider (Truv), confirms their address, uploads any remaining documents, and e-signs forms. Everything the client provides lands in the admin case view with live status, and staff push the documents straight into the Logics case with one click. The existing ResSpark screening engine (32-question intake, Form 433-A math, IRS standards, resolution-path determination) becomes the "433-A pre-population" view that staff can review.

## Core Value

A case manager can send a client one link and get bank statements, pay stubs, and documents back into the Logics case without chasing, babysitting, or re-uploading. If nothing else works, "send link, client connects, docs appear in the case" must work.

## Business Context

- **Customer**: Tax-resolution firms (ValorTax first; Alleviate and other firms named as follow-on). Users are case managers and settlement officers (Nicole, head of resolution; Sandra, in-the-trenches case manager) and their clients (taxpayers with IRS debt).
- **Revenue model**: Build for ValorTax first, then white-label and resell to other CPA, EA, and tax-resolution firms. Integration costs are pay-as-you-go (Plaid roughly $10-14 per user all-in; Teller cheaper; Truv pay-as-you-go).
- **Success metric**: Time from "agent is on the phone with the client" to "all required docs are in the Logics case". Target: minutes, not days. Secondary: number of chase calls, texts, and emails per case.
- **Strategy notes**: Call transcript `transcript.md` (ValorTax Meet, Oct 6 2026, Zack Hanna and Andrew Rios). Demo scheduled Mon Oct 12 2026 11:30 ("Build MVP: admin + client, Supabase, Truv, Plaid/Teller, eSign, Logics"). Then meetings every 2-3 days to refine.

## Requirements

### Validated

Inferred from the existing codebase (see `.planning/codebase/`). These work today and are relied upon:

- ✓ 32-question intake definition with applicability rules and typed validation (`src/questions.py`, `src/frontend/src/questions.ts`, `src/intake_workflow.py`) — existing
- ✓ Document-request derivation from answers, e.g. two vehicles produce two vehicle document requests (`src/intake_workflow.py`, `src/frontend/src/document-upload/requests.ts`) — existing
- ✓ Canonical `FinancialData` dataclass mirroring Form 433-A line items, with NULL-means-unknown semantics (`src/financial_data.py`) — existing
- ✓ Deterministic IRS screening math: gross monthly income, allowable expenses from IRS standards, net disposable income, net realizable equity, compliance gate, resolution-path selection (`src/determination.py`) — existing, 27 Python tests pass
- ✓ IRS standards in PostgreSQL seed data, retrieved through a parameterized repository (`src/standards_repository.py`, `src/schemas/`) — existing
- ✓ PDF document classification and field extraction (account transcripts, pay stubs, bank statements, lease, mortgage, auto) with optional OpenRouter LLM fallback (`src/document_parse.py`) — existing
- ✓ Local HTTP adapter `POST /api/cases` that merges answers and parsed uploads and returns a determination payload (`src/case_api.py`) — existing, localhost only, no auth
- ✓ Browser intake flow, upload screen, and resolution results screen (vanilla TS + Material Web, `src/frontend/src/`) — existing, to be fully redesigned

### Active

Admin portal (staff side):
- [ ] Staff sign in (Supabase Auth) and see a dashboard of open requests, what is waiting on them, and what is overdue
- [ ] Staff look up a Logics case by case ID, phone number, or email (Logics Find endpoints), see name, phone, and email, and confirm "is this the right person?" before anything is sent
- [ ] Staff pick what to request (bank connection, payroll connection, specific documents, e-signature) and send the client a link; email and phone are validated before sending (no empty fields, no typo domains such as `gmailcom`)
- [ ] Staff see a copyable client link so they can resend from their own phone or email when the client says it went to spam
- [ ] Staff see live per-request status: sent, opened, in progress (bank connected, payroll connected, N of M docs uploaded), done, with timestamps and no manual reload
- [ ] Staff open a case and see everything the client provided: linked bank accounts with statements (last 6 months), payroll and employer data with pay stubs and W-2s, uploaded documents, and e-signed forms, each with approve or reject-with-note per item
- [ ] Staff push selected documents into the Logics case (Create Case Document, 6 MB limit) and an activity note is written on the case
- [ ] Staff see a 433-A pre-population view: income, expenses, and assets pre-filled from connected data and intake answers, IRS standards for the client's county applied, and the determination engine's recommendation and math visible

Client portal (client side):
- [ ] Client opens the link on a phone with no account, password, or app; the page is mobile-first and shows the firm's name and the agent's name so it is recognizably legitimate
- [ ] Client sees a simple step list (connect bank, connect payroll, confirm address, upload documents, sign) with clear done and not-done state, so an agent on the phone can ask "are you on this step?"
- [ ] Client connects a bank through Plaid; the system pulls 6 months of transactions and available monthly statement PDFs; Teller is a one-config-line alternative provider
- [ ] Client connects payroll through Truv; multiple employers are supported (two jobs, a 1099, switched jobs two years ago); pay stubs, W-2s, and income and employment data are retrieved
- [ ] Client confirms their home address with Smarty autocomplete, which yields a USPS-validated address and county so county selection and IRS local standards need no manual step
- [ ] Client uploads documents by drag-drop or camera roll per requested item, with progress, resumable on reload
- [ ] Client e-signs requested forms (DocuSeal) from the same link, mobile-friendly, with a copyable signing link for the agent
- [ ] Client answers the 32 intake questions (existing contract) in the redesigned UI; questions answerable from connected data or Logics case data are pre-filled

Platform:
- [ ] All integration calls (Logics, Plaid, Truv, DocuSeal, Smarty, OpenRouter) run server-side; no secrets reach the browser
- [ ] Webhooks from Plaid and Truv update request status automatically
- [ ] Every client-visible and staff-visible action is written to an audit and event log on the case
- [ ] Deployed to Cloudflare (SPA plus API Worker) with Supabase (Postgres, Auth, Storage) so the Oct 12 demo runs on a real URL
- [ ] AI (OpenRouter) is used only where it saves staff time: classify and extract uploaded documents, summarize what came in; never for the determination math

### Out of Scope

- Own SMS sending through a Twilio-style provider — no SMS provider key is available; Plaid and Truv can deliver their own links by SMS, and the agent gets a copyable link for everything else. Revisit when a provider is chosen.
- Replacing IRS Logics as the CRM — Logics stays the system of record; ResSpark reads cases and writes documents and activities to it.
- AI resolution-outcome strategy report from IRS transcripts (the Owen & Dax product Andrew showed) — Zack chose to solve document collection first; deferred.
- Email-attachment-to-Logics automation (n8n-style forwarding of Sandra's inbox) — Andrew is building this separately.
- Consumer identity verification (Stripe Identity) and voice-verified signing — belongs to Zack's other product, not ResSpark.
- Native mobile apps — the client portal is a mobile-first web page.
- Multi-tenant white-labeling for other firms — single firm (ValorTax) for v1; keep firm name and branding in config so it is cheap later.
- Plaid credit and consumer-lending products — Andrew declined the annual contract; we use Transactions and Statements only.

## Context

- **Existing codebase**: Python 3 stdlib backend (determination engine, document parsing, local HTTP API), vanilla TypeScript + Vite + Material Web frontend, PostgreSQL schema with IRS standards seed data, Supabase client stub (unused). See `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS, CONCERNS).
- **Known issues to address** (from CONCERNS.md): root `.gitignore` has a merged line `.envnode_modules/` so `.env` is not matched by that pattern; `src/frontend/dist/` is tracked; `src/document_parse.py` (954 lines) and `src/tests/test_document_parse.py` (558 lines) exceed the 500-line limit; IRS thresholds are hard-coded in `src/determination.py` and there is no `test_determination.py`; `FinancialData` money defaults to 0 outside the database path; client documents are sent to OpenRouter without redaction; `src/case_api.py` has no auth.
- **The CRM**: IRS Logics (Logiqs) public API V4 at `https://valortax.logiqsapi.com/publicapi/V4/`, HTTP Basic auth (API key as username, secret token as password). Endpoints we use: `Find/FindCaseByPhone`, `Find/FindCaseByEmail`, `Find/FindCase` (last name plus phone), `Case/CaseInfo` (by CaseID), `Documents/CaseDocument` (multipart upload, 6 MB max, optional FileCategoryID and Comment), `CaseActivity/Activity` (create note), and Task endpoints. Full doc: `Logics_API_Documentation.docx.md`. Credentials are not in the repo yet.
- **Truv**: Create Order (`POST /v1/orders/`, products `income` and `assets`, with `email`, `phone`, and `notification_settings`) returns a `bridge_token` and `share_url`; `TruvBridge.init({ isOrder: true, bridgeToken })` client-side; webhooks `task-status-updated` and `order-status-updated`; data via `GET /v1/orders/{id}/`, `GET /v1/links/{link_id}/income/report/`, the uploaded documents API, and asset reports. Sandbox logins: `goodlogin`/`goodpassword`, `multiple.employments`. CSP must allow `my.truv.com` and `cdn.truv.com`.
- **Plaid**: `/link/token/create` with `hosted_link` (`delivery_method: "sms"`, `completion_redirect_uri`) returns `hosted_link_url`; webhook `LINK SESSION_FINISHED` carries `public_tokens`; then `/item/public_token/exchange`, `/transactions/sync`, and the Statements product (`/statements/list`, `/statements/download`, PDF as the bank issued it, supported at Bank of America, Citi, Wells Fargo, US Bank, Fifth Third, Huntington, Regions and others). `react-plaid-link` for embedded Link. Andrew has pay-as-you-go access; compliance is framed as "tax preparation and tax paperwork help".
- **Teller**: Teller Connect (`https://cdn.teller.io/connect/connect.js`) and `GET /accounts/{id}/transactions?start_date&end_date` with basic auth on the access token. Cheaper Plaid alternative with less hand-holding. Design the bank-provider boundary so switching is one config line.
- **DocuSeal**: `@docuseal/react` `DocusealForm` (embedded signing), `@docuseal/api` `createSubmission({ template_id, send_email, submitters })`, `DocusealBuilder` with a JWT for staff template building. Cloud API or self-hosted. Reference repo `docusealco/docuseal`.
- **Smarty**: US Autocomplete Pro API (`https://us-autocomplete-pro.api.smarty.com/lookup?key=EMBEDDED_KEY&search=...`, referer or allowed host required) returns suggestions with county and residential or commercial flag. Replaces the manual county dropdown (`src/frontend/src/counties.generated.ts`).
- **Supabase**: project exists (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` in `src/frontend/.env`). Use Postgres with RLS, Auth for staff, Storage for documents. Use the `supabase` skill for all Supabase work.
- **Cloudflare**: `CLOUDFLARE_API_TOKEN` in `.env`; use `npx wrangler`. No wrangler config exists yet.
- **OpenRouter**: `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in `.env`.
- **Reference repos (copy patterns, do not reinvent)**: `satnaing/shadcn-admin` (15.7k stars, MIT, Vite + React + TanStack Router + shadcn/ui: admin shell, sidebar, data tables, command palette); `seziro-team/gather` (open-source client document collection: request builder, no-account magic-link portal, per-item approve and reject, reminders, audit trail; AGPL, so copy patterns not code); `plaid/react-plaid-link` and `plaid/pattern`; `docusealco/docuseal-react`; `frappe/erpnext` (list and table views, status badges, sidebar nav); `bigcapitalhq/bigcapital` (money-formatted fields, financial statements); `docusealco/docuseal` (document upload, builder, submission status screens). Before each new feature, web-search for an existing repo and copy from it.
- **Design direction**: everything redesigned; data-heavy business UI like ERPNext for staff; clean, mobile-first, step-by-step like DocuSeal and Gather for clients. Front end must be TypeScript.
- **People**: Nicole and Sandra are the users to interview about the 433-A layout and admin UI. Andrew will send the 5-minute pitch video and the strategy-report PDF.

## Constraints

- **Timeline**: Working MVP demo on Mon Oct 12 2026 11:30 — admin portal, client portal, Supabase, Truv, Plaid (Teller-ready), e-sign, Logics push. Everything else is iteration after feedback every 2-3 days.
- **Tech stack**: TypeScript for all front end (CLAUDE.md). Supabase for data, auth, and storage; Cloudflare for hosting and the API Worker; OpenRouter for any LLM calls. The Python engine may remain for the 433-A math or be ported; decide in that phase with targeted tests either way.
- **Compliance and domain**: Form 433-A is signed under penalty of perjury; calculations and eligibility gates must stay deterministic and sourced (CLAUDE.md). Never change IRS thresholds or formulas without an authoritative source and tests. ResSpark screens; a CPA or EA reviews.
- **Security**: Client tax documents and bank data are sensitive. Secrets server-side only; RLS on every table; signed, short-lived download URLs; audit log; the client link must be unguessable and expirable; do not send raw documents to an LLM without a deliberate decision.
- **Code rules (CLAUDE.md)**: no code file over 500 lines, split modularly; a companion Markdown doc in `docs/` for every code file, kept in sync; Ponytail (smallest complete change); unittest and Vitest style; standard library preferred in Python.
- **Bank-statement window**: 6 months by default (standard resolution uses the last 3; pull 6 so the firm can choose).
- **Logics upload limit**: 6 MB per file; compress or split PDFs.
- **Budget**: pay-as-you-go integrations only; no annual contracts.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rebuild the frontend as React + Vite + TypeScript + Tailwind + shadcn/ui, starting from `satnaing/shadcn-admin` | User wants everything redesigned with copied, proven components; most-starred shadcn admin and matches the Vite/TS toolchain already in the repo | — Pending |
| One SPA with two route trees (`/admin/*` staff, `/c/:token` client) | Shared design system and build; client routes are token-gated, staff routes are Supabase-auth gated | — Pending |
| API as a Cloudflare Worker (Hono) that also serves the SPA assets; Supabase for Postgres, Auth, Storage | Single deploy; the Worker holds integration secrets and receives Plaid, Truv, and DocuSeal webhooks; Supabase gives RLS, auth, and storage without servers | — Pending |
| Client access is a signed, expiring token link (no account) | Transcript: send a link, they log in, fill out details, done; Gather proves the pattern | — Pending |
| Bank provider behind one interface with Plaid first, Teller second | Andrew: one-line configuration change, saves real money | — Pending |
| Pull 6 months of statements and transactions | Zack's call on the transcript | — Pending |
| Logics stays the system of record; we write documents and activity notes to it | Firm workflow lives in Logics; rep types case number, phone, or email and the case is found | — Pending |
| 433-A pre-population is a later phase, reusing the existing engine | Zack: solve getting docs in faster before analyzing; layout needs Nicole and Sandra input | — Pending |
| No own SMS provider in v1; copyable link plus provider-sent SMS (Plaid, Truv) | No SMS provider key available; avoids blocking the demo | — Pending |
| Fix `.gitignore` and untrack `dist/` in Phase 1 | Secrets hygiene before any new env vars are added | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-10 after initialization*
