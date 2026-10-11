# Feature Research

**Domain:** Two-sided tax-resolution document-collection platform (staff admin portal + no-account client portal) layered on IRS Logics, with bank/payroll connect, e-sign, and 433-A pre-population
**Researched:** 2026-10-10
**Confidence:** MEDIUM overall. Repo stars, licenses and push dates were read first-hand from the GitHub API on 2026-10-10 (HIGH). IRS form line items were read from the live IRS PDFs (433-A Rev. 6-2026, 433-A(OIC) Rev. 4-2026, 433-F Rev. 7-2024) and Plaid's published taxonomy CSV (HIGH for what they state). Competitor feature claims come from vendor marketing pages and third-party roundups (LOW to MEDIUM; the GSD confidence seam rates scraped sources MEDIUM and plain web search LOW).

## Read This First: Five Findings That Change the Plan

1. **`seziro-team/gather` is not a proven pattern. It has 0 stars, 0 forks, was created 2026-07-28, is labelled "alpha", and is AGPL-3.0.** It is Next.js + Node + Postgres + Docker, so it cannot be dropped into a Cloudflare Worker + Supabase stack. Its README is an unusually good *spec* (request builder, no-account portal, per-item approve/reject, reminder cadences that stop on completion, hash-chained audit), and it ships four IRS/CFPB-sourced templates. Treat it as a requirements checklist and reading material. Do not copy code. PROJECT.md currently calls it "proves the pattern"; that overstates it.
2. **Licensing blocks "copy" for most of the best-matching repos.** DocuSeal (18,690 stars), Documenso (15,380), Gather, Bigcapital (3,931) and UsTaxes (1,675) are AGPL-3.0. ERPNext (39,984) is GPL-3.0. Because the plan is to white-label and resell, copying AGPL/GPL source into the product creates a source-disclosure obligation for the whole network service. Safe options: (a) MIT/Apache code you can copy outright (shadcn-admin, TanStack, Uppy, react-dropzone, react-pdf, Hono, jose, react-email, Plaid samples); (b) AGPL products used **unmodified as a separate service or via their cloud API** (DocuSeal), which is what the plan already does; (c) AGPL/GPL repos as visual and structural references only.
3. **There is no open-source project for tax-resolution 433-A intake.** GitHub searches for "form 433-A", "IRS form 433-A" and "tax resolution" return only 0 to 2 star repos (best: `jup313/irs-financial-calculator`, 1 star, MIT, unvetted). The 433-A pre-population view is original work. The closest reusable pieces are the Plaid category taxonomy (official CSV), the existing `src/determination.py` engine, and a PDF library if worksheet export is wanted.
4. **Logics' public API has no way to read documents, read the Financial Questionnaire, or write 433-A fields.** The V4 doc lists Appointment, Billing, Case, Case Activity, Documents (one endpoint, create only), Fax, Find, Report, Services, Task, User. So: ResSpark must track "what has been pushed to Logics" in its own database, cannot show what is already on file in Logics, and cannot push structured 433-A data into IRSLogics' own 433-A form (which IRSLogics auto-populates from its own Financial Questionnaire). Pre-population output to Logics is therefore a **PDF/CSV worksheet attached as a Case Document plus an activity note**.
5. **Competitors differ on what they sell; ValorTax's real gap is narrow.** IRSLogics (their CRM) already has client portal, uploads, e-sign, SMS thread, Financial Questionnaire that auto-populates 433-A/433-B/OIC worksheets. What it lacks (per the transcript) is: connected bank and payroll data, a copyable/mobile-friendly signing link, and a way to stop agents babysitting clients over the phone. ResSpark wins by being the **connect-and-collect front door that feeds Logics**, not by rebuilding Logics.

---

## Competitor Landscape (what exists, so we know the baseline)

| Product | Category | Request / checklist | Portal | Reminders | Review | E-sign | Bank / payroll connect | 433-A or resolution forms | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| **IRSLogics** (ValorTax's CRM) | Resolution-first CRM | Financial Questionnaire sent from case | Branded: uploads, e-sign, appointments, billing | Two-way SMS thread in case; automations | Approve questionnaire data, then auto-populate | Built in (transcript: "sucks": email-only link, poor on phone) | None found | Auto-populates 433-A, 433-B, OIC worksheets; TDS transcript pulls; audit trail; role-based access | MEDIUM (vendor blog) |
| **PitBullTax** | Resolution-first | Client questionnaires | Client portal with built-in chat | Not a headline feature | n/a | Via add-ons | None found | Auto-populated IRS forms and schedules, Resolution Evaluation, transcript delivery/monitoring; $135/mo + add-ons | MEDIUM (vendor site) |
| **IRS Solutions / Tax Help Software** | Resolution-first | Not researched in depth | Not researched | Not researched | n/a | n/a | n/a | Resolution eligibility, transcript monitoring | LOW (named in competitor pages only) |
| **Canopy** | Practice mgmt with strongest resolution toolset | Client requests with received/outstanding tracking | Polished branded portal | Automated reminders | Staff tag/review; AI Copilot auto-tags uploads | Native | None found | IRS transcript pulls, notice mgmt, case workflow; $22/user/mo | MEDIUM (third-party roundups) |
| **TaxDome** | All-in-one practice mgmt | Requests: ask question / request doc / confirm; templates; statuses completed, pending, overdue; link to jobs and auto-advance | Branded portal + 4.9 rated mobile app; organizers | One-click reminders; automatic via pipelines | Clients approve items; staff review | Native (incl. 8879) | None found | Not resolution-specific | MEDIUM (vendor page) |
| **Karbon** | Internal work mgmt | Work items, email in context | No native portal (pair with Liscio/SmartVault) | n/a | n/a | via integration | None | None | MEDIUM |
| **Liscio** | Client communication | Templated organizers/requests | Mobile-first feed (email + SMS + secure message) | Via messaging | n/a | Yes | None | None; GruntWorx extraction integration | MEDIUM |
| **SmartVault** | DMS + portal | SmartRequest / SmartRequestAI document requests | Branded portal, folders | Automated requests | OCR search, routing | Integrated eSignature | None | None; SOC 2 Type 2, IRS Pub 4557 aligned | MEDIUM |
| **Clustdoc** | Client onboarding | Checklist, form builder | One secure branded link | Scheduled email + SMS follow-ups | Status per item | Sequential/parallel signing, prefill | None | None | MEDIUM |
| **Pipefile** | Document collection | Interactive checklists, fillable forms | Client portal | Email + SMS, customizable schedules, auto-monitoring | Notifies on missing/incorrect | n/a | None | None | LOW to MEDIUM (stop/escalation rules not published) |
| **Gather (OSS)** | Document collection | Request builder with sections, items, templates | No-account magic link | 3 cadences, client-timezone, quiet hours, stops on completion | Per-item approve/reject with note | Not built | None | None | HIGH for what the README states; 0 stars, alpha |

**The white space ResSpark can own:** none of the products above connect a bank or payroll provider *as the collection mechanism* and turn the result into 433-A line items. Everyone else asks the client to upload PDFs.

---

## Feature Landscape

Legend for "Copy from": `COPY` = MIT/Apache/BSD, safe to lift code. `SERVICE` = AGPL product used unmodified as a separate service/API. `PATTERN` = AGPL/GPL or too immature; read, do not copy code. Stars and licenses verified 2026-10-10.

### (a) Staff Request Builder and Status Dashboard

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Staff sign-in, role-aware (Supabase Auth) | Every competitor has staff accounts; Logics doc stresses role-based access | LOW | RLS on every table; at least `admin` and `case_manager` |
| Case lookup by case ID, phone, email, then "is this the right person?" confirm card | Transcript requirement; avoids sending to the wrong client when agents have five tabs open | MEDIUM | Logics `Find/FindCaseByPhone`, `FindCaseByEmail`, `FindCase` (last name + phone), then `Case/CaseInfo` for name, phones, email, address, DOB, marital status |
| Request builder: tick what to request (bank, payroll, named documents, e-sign, address confirm) | TaxDome/Clustdoc/Pipefile/Gather all have a checklist builder | MEDIUM | Reuse existing document-request derivation (`requests.ts`) for suggested defaults from intake answers |
| Request templates ("Standard IA package", "OIC package", "Self-employed add-on") | TaxDome templates, Gather ships 4 | LOW | Seed 3 to 4; do not build a template editor in v1, seed via migration |
| Contact validation before send (non-empty, E.164 phone, typo-domain check such as `gmailcom`, `gmial.com`) | Explicit transcript requirement | LOW | `mailcheck` (7,936 stars, MIT) for typo suggestions; `libphonenumber-js` (2,999 stars, MIT) for phone |
| Copyable client link + "resend" + "regenerate/revoke" | Transcript: agent copies link when "it's in spam" | LOW | Show full link and short link; revoking invalidates old token |
| Dashboard list: status chips, search, filter (waiting on client, overdue, done, mine), sort by last activity | TaxDome filters by status; Gather "opens on work" | MEDIUM | Columns: client, case ID, requested items, N of M done, last activity, sent time, assignee |
| Live per-request status with timestamps: sent, opened, in progress (bank connected, payroll connected, N of M docs), done | Transcript: "wait for a refresh or poll"; project requires no manual reload | MEDIUM | Supabase Realtime on request/step tables; fall back to TanStack Query polling every 10 to 15 s |
| Per-request event timeline (audit log) | IRSLogics and SmartVault both market audit trail | MEDIUM | Append-only `events` table; every client and staff action; Gather's hash-chaining is a nice-to-have, not v1 |
| Overdue definition and visual flag | TaxDome pending/overdue; project requires "what is overdue" | LOW | Per-request `due_at`; overdue is derived, not stored |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **"Mirror" view: what step is the client on right now** (current step, last heartbeat, last error such as "Plaid: bank login failed") | Directly serves the transcript's core pain: agent on phone asking "are you on this step?" for an hour. Nobody else has it | MEDIUM | Client portal writes `current_step` and `last_seen_at`; staff view shows a thumbnail of each step the client sees |
| Webhook-driven status (Plaid `SESSION_FINISHED`, Truv `task-status-updated` / `order-status-updated`, DocuSeal `form.completed`) | Status updates even if client closes the tab | MEDIUM | All webhooks land on the Worker; verify signatures |
| Request assignment and "my requests" default | Nicole (head) vs Sandra (case manager) usage differs | LOW | `assigned_to` column; saved filter |
| Quick-create from Logics status or task (e.g., new case enters "Documents needed" stage) | Removes the lookup step entirely | HIGH | Logics has no webhooks; would need polling `Get Cases By Status`. Defer |
| Write-back to Logics: activity note when sent, when opened, when done; create a Task when client finishes | Closes loop inside the tool staff live in | LOW | `CaseActivity/Activity`, Task endpoints. Rate and noise: write on state changes only |
| Per-firm branding config (name, logo, agent name on client page) | Needed to look legitimate to clients and cheap white-labeling later | LOW | A `firm_settings` row, not multi-tenancy |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Full CRM / case-list replacement | "We have the data, show all cases" | Logics is system of record (PROJECT.md); duplicates and drifts | Look up on demand; store only a thin case mirror |
| Kanban/workflow pipelines and job automation (TaxDome, Karbon) | Looks impressive in demos | Weeks of work; ValorTax already runs workflow in Logics | One status field per request |
| Billing, invoices, payments | IRSLogics, PitBullTax, TaxDome all have them | Out of core value; Logics owns it | None |
| Custom request-template builder UI | Flexibility | Premature before staff say what they need | Seed templates in SQL; revisit after Nicole/Sandra feedback |
| Bulk "send to 300 clients" | Case managers carry 300 to 500 cases | Spam risk, wrong-client risk, no feedback yet | Single-send with confirm card; revisit as v1.x |

**Copy from:**
- Admin shell, sidebar, data tables, command palette: `satnaing/shadcn-admin` (15,684 stars, MIT, pushed 2026-09-10). `COPY`.
- Table, filtering, polling: `TanStack/table` (28,478, MIT), `TanStack/query` (50,412, MIT). `COPY`.
- Live status: `supabase/realtime` (7,647, Apache-2.0). `COPY` (via supabase-js).
- Status badges, list-view conventions: `frappe/erpnext` (39,984, GPL-3.0). `PATTERN`.
- Request builder structure, section/item model, preview, "dashboard opens on work": `seziro-team/gather` (0 stars, AGPL-3.0, alpha), see `apps/web/src/app/(app)/requests/[id]/`. `PATTERN`, spec only.

---

### (b) Client No-Account Portal

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Unguessable, expiring, revocable token link (no account, no password, no app) | Core requirement; Gather, Clustdoc, Pipefile all do this | MEDIUM | 128-bit+ random token stored hashed; `expires_at`; `revoked_at`; rate limit by IP and token. `jose` (7,824, MIT) if signed JWT is preferred over opaque token. Opaque hashed token is simpler and revocable |
| Mobile-first layout, large tap targets, works in in-app browsers (SMS preview, Gmail) | Clients open this from a text on a phone | MEDIUM | Test iOS Safari, Android Chrome, Gmail in-app browser; Plaid OAuth banks bounce out to a bank app and back |
| Firm name, logo and agent's name at top | Transcript: legitimacy; phishing fear is real with bank connect | LOW | From `firm_settings` and request `created_by` |
| Step list with clear done / not done state | Transcript requirement | LOW | Steps derive from what staff requested. Hide steps not requested |
| Save and resume (reload, close tab, switch device via same link) | Clients get interrupted; Gather "close the tab mid-sentence and nothing is lost" | MEDIUM | Server-side state per step; idempotent step completion |
| Upload per requested item: drag-drop, camera roll, camera capture; progress; resumable; file type and size checks | Table stakes everywhere | MEDIUM | Supabase Storage supports TUS resumable; `Uppy` (31,022, MIT) with `tus-js-client` (2,627, MIT) or `react-dropzone` (11,013, MIT) for a lighter UI. Accept PDF, JPG, PNG, HEIC; convert phone photos to PDF server-side or client-side |
| Address confirm with Smarty autocomplete -> county | Transcript requirement; removes manual county dropdown and drives IRS Local Standards | LOW | Embedded key is public by design; lock to allowed hosts. Store county FIPS, not just name |
| Plain-language help text at each step ("Why do you need my bank?") | Reduces abandonment and compliance fear | LOW | One paragraph per step, written for non-technical clients |
| Always-visible manual fallback ("I can't connect, upload instead") | Banks and employers will fail; clients refuse OAuth | LOW | Falls into the same upload checklist so staff see one list |
| Security headers, CSP allowing only `cdn.plaid.com`, `cdn.teller.io`, `my.truv.com`, `cdn.truv.com`, Smarty, DocuSeal | Client tax data | MEDIUM | CSP is the part most likely to break the demo; test early |
| Completion screen: "You're done. [Agent] has been notified." | Ends the call cleanly | LOW | Triggers staff notification |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Light identity gate on link open (confirm date of birth, which Logics already holds) | A forwarded or leaked link is otherwise a bearer credential to bank-connect flows | LOW to MEDIUM | Compare to `Case/CaseInfo.DOB`; lock after 5 failures; staff can disable per request. Recommend ON by default |
| Pre-filled intake: the 32 questions answered from Logics, Truv, Plaid or uploads, shown as "confirm" instead of "enter" | Cuts form time; leverages existing intake contract | MEDIUM | Never skip a question silently; mark source. Preserves NULL vs 0 semantics |
| Step-by-step "phone script" side panel for the agent (staff-only, mirrors the client's step) | Turns junior staff into confident guides | LOW | Static text per step |
| Per-step estimated time ("about 2 minutes") | Reduces perceived burden | LOW | Static copy |
| Spanish language option | Tax-resolution client base; Logics has a `Language` field | MEDIUM | i18n scaffold in v1.x, not demo |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Client accounts, passwords, "log in to see history" | Familiar | Defeats the one-link value; password resets become the new chase | Link only; reissue link if expired |
| Native mobile app | TaxDome has one | Out of scope; link-to-web is the point | Mobile web |
| Client-to-staff secure messaging | Liscio, PitBullTax have it | Logics already has two-way SMS thread | Pre-filled "Call [agent] at [phone]" button |
| Session replay (e.g., PostHog) on token pages | Zack uses PostHog; helpful for debugging drop-off | Would capture bank/payroll flows, SSN, addresses | Disable replay on `/c/*`; use event-only analytics with no input capture, or mask everything |
| Show prior documents or other requests to client | "Transparency" | Leak risk if link is forwarded | Show only the current request |
| Public sign-up or "start a case yourself" | Growth idea | Different product (that is the transcript's lead-gen angle) | Not v1 |

**Copy from:**
- Portal screens, checklist, file-upload component, progress bar behaviours: `seziro-team/gather` `apps/web/src/components/portal/` (`checklist.tsx`, `file-upload.tsx`, `screen.tsx`) and `app/portal/[id]/`. `PATTERN` (0 stars, AGPL).
- Uploads: `transloadit/uppy` (31,022, MIT), `tus/tus-js-client` (2,627, MIT), `react-dropzone/react-dropzone` (11,013, MIT). `COPY`.
- Clean submission/status screens: `docusealco/docuseal` (18,690, AGPL-3.0). `PATTERN` (visual).
- Token handling: `panva/jose` (7,824, MIT). `COPY`.
- Rejected: `stonith404/pingvin-share` (4,661, BSD-2) is the best-known no-account share-link app but is **archived**; do not build on it.

---

### (c) Bank and Payroll Connection Flows

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Bank provider interface with Plaid first and Teller second (one config line) | Transcript: one-line change, pay-as-you-go | MEDIUM | Interface: `createSession`, `handleWebhook`, `fetchAccounts`, `fetchTransactions(start,end)`, `fetchStatements?`, `removeConnection`. Actual Budget (29,421 stars, MIT) ships multiple bank-sync providers (`app-gocardless`, `app-simplefin`, `app-pluggyai`, `app-enablebanking`, `app-akahu`) behind one sync boundary: good structural reference |
| Plaid Hosted Link (SMS or URL) or embedded Link with OAuth redirect handled | Mobile OAuth banks (Chase, Wells Fargo, BofA) leave the page and return | MEDIUM | PROJECT.md already plans hosted link; use `completion_redirect_uri` to return to `/c/:token` |
| Pull 6 months of transactions (configurable per request) and available statement PDFs | Transcript: 3 months standard, 6 chosen; 433-A(OIC) wants 3 months personal, 6 months business bank statements | MEDIUM | `/transactions/sync`; `/statements/list` + `/statements/download` where the institution supports them |
| Multiple accounts and multiple banks per client; tag each account personal vs business | 433-A asks per account; OIC asks 6 months for business accounts | MEDIUM | Per-account tag set by client ("is this for your business?") and editable by staff |
| Fallback when the bank is unsupported or Statements PDFs are unavailable | Statements coverage is limited to a short list of institutions | LOW | Show "Upload your statements" for that account; keep the transaction pull |
| Handle failure states: bad login, MFA timeout, institution down, user closes Link | Real-world failure rate is substantial; agent is on the phone | MEDIUM | Surface error text to staff mirror view; offer retry and fallback |
| Consent and purpose copy before launching Link/Bridge | Both providers screen the use case ("tax preparation and tax paperwork help" is Andrew's framing) | LOW | Plain-language one-liner; link to privacy page |
| Truv Bridge for payroll; multiple employers, switched jobs, 1099 | Transcript: two jobs, 1099, switched jobs two years ago | MEDIUM | Truv income report aggregates across all links of one user with `links[].employments[]`; multi-employer behaviour in a single order is **untested** (Zack said so); spike in sandbox with `multiple.employments` |
| Retrieve pay stubs (statements), W-2s, employer and income data | Transcript requirement | MEDIUM | Fields available: `gross_pay`, `net_pay`, YTD values, `period_start/end`, `pay_date`, `basis_of_pay`, `earnings[]`, `deductions[]` (categories `federal`, `state`, `socialsec`, `medicare`, `retirement`, `benefit`, `garnishment`, `local`, `memo`, `other`), `w2s[]`, `company{name,address,phone,ein}`, `start_date`, `pay_frequency`, `bank_accounts[]` |
| "Can't find my employer" fallback to upload pay stubs | Not every employer is supported | LOW | Same upload item as in (b) |
| Server-side only for secrets and tokens; webhook signature verification | Security constraint | MEDIUM | Worker verifies Plaid and Truv webhooks; store tokens encrypted; never in the browser |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Remove the Plaid Item after the one-time pull** (`/item/remove`) | Bank access is a point-in-time document collection, not monitoring; limits liability and avoids ongoing per-Item fees (billing model: MEDIUM confidence, verify on Andrew's Plaid dashboard) | LOW | Do it on staff "close request" or after N days. Keep pulled data |
| Statement coverage check: contiguous months, last 3 complete months present, balance continuity between statements, "all pages present" | IRS rejects incomplete statements; saves staff a manual review pass | MEDIUM | Deterministic checks on parsed PDFs plus transaction date ranges. Extends the existing `document_parse.py` |
| Auto-detected recurring streams (rent, mortgage, car payment, insurance, utilities, subscriptions) | Gives per-month figures rather than raw lists; Plaid `/transactions/recurring/get` exists | MEDIUM | Output feeds the 433-A proposal (section f) |
| Direct-deposit hint: Truv `bank_accounts[]` tells staff which bank account receives pay | Detects a missing bank the client forgot to connect | LOW | Compare to connected accounts; flag in staff view |
| Cross-check payroll income vs bank deposits (Truv gross vs Plaid `INCOME_SALARY` net deposits) | Catches second jobs, cash income, undisclosed accounts: a real value for practitioners signing under penalty of perjury | MEDIUM | Present as flags, never auto-conclusions |
| Provider cost telemetry (per request: provider, cost estimate) | Andrew's whole pitch is cost: $10 to $14 per user | LOW | Counter table; no billing logic |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Ongoing transaction monitoring / daily sync | "Keep data fresh" | Ongoing fees, privacy and consent scope creep, not needed for a collection workflow | One-time pull; staff can send a new request |
| Plaid credit, Income, Assets, or Statements-based underwriting products | Andrew's earlier pitch: Plaid auto-categorizes for 433 | Andrew declined the annual contract and consumer-lending category; adds compliance burden | Transactions + Statements only |
| Truv "assets" order alongside Plaid | Redundant data | Double charges and two sources of truth for bank data | Truv for payroll only (`income` product) |
| Storing bank credentials or building a scraper | Cheaper | Illegal-adjacent, brittle, unsafe | Provider only |
| Collecting full account and routing numbers via Plaid Auth | 433-A asks for full account number | Needs another Plaid product and expands sensitive data | Staff copy last-4 and full number from the statement PDF |
| Auto-importing client credentials for payroll providers (staff "preset the password") | Transcript: agents sometimes preset passwords | Staff should never hold client credentials; liability | Client types their own; use Truv's login flow |

**Copy from:**
- Plaid embedded Link: `plaid/react-plaid-link` (287, MIT). `COPY`.
- End-to-end Plaid item, webhook and transactions flow: `plaid/pattern` (544, MIT) and `plaid/quickstart` (751, MIT); server SDK `plaid/plaid-node` (585, MIT). `COPY`.
- Provider boundary: `actualbudget/actual` (29,421, MIT), `packages/sync-server/src/app-*`. `COPY` the shape, not the code.
- Teller: `tellerhq/teller-connect-react` is **10 stars with no license**; load the official script `https://cdn.teller.io/connect/connect.js` and write a thin wrapper instead. `PATTERN`.
- Truv: `truvhq/quickstart` (5 stars, MIT) is the only official sample; use for webhook and Bridge init wiring only. `COPY` (small).

---

### (d) Document Review (Approve / Reject)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Per-item approve or reject with a note the client sees | PROJECT.md; Gather's headline; TaxDome has approve on items | MEDIUM | Rejection re-opens only that item on the same link; keep superseded file |
| In-browser preview (PDF and images) without downloading | Reviewing 20+ docs per case | MEDIUM | `react-pdf` (11,190, MIT) over `pdf.js` (53,990, Apache-2.0); images native; short-lived signed URLs |
| Grouped case view: bank accounts and statements, employers and pay stubs/W-2s, uploaded docs, signed forms | Project requirement | MEDIUM | One page, four sections, each with item states |
| Status per item: requested, uploaded, approved, rejected, pushed to Logics | Workflow clarity | LOW | Enum on `request_items` |
| "Done" is staff's judgment, not "a file exists" | Gather's key idea; avoids clients "done" with a blank photo | LOW | Request completes only when all required items are approved |
| Push approved items to Logics (Create Case Document, 6 MB cap) with a comment and an activity note | Core value | MEDIUM | Compress or split >6 MB PDFs; map `FileCategoryID`; record `CaseDocumentID`; idempotent (never push twice) |
| Download as zip, with manifest | Common request; Gather ships it | LOW | Optional v1.x |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| AI document classification and field extraction as *suggestions* ("looks like Chase checking statement, Aug to Oct") | Saves staff time; existing `document_parse.py` | MEDIUM | Suggestions only; never auto-approve. Redact before any OpenRouter call (CONCERNS.md flags raw doc exposure) |
| Staleness and completeness warnings (pay stub older than 60 to 90 days, statement missing a page, wrong account holder name, unreadable scan) | Cuts reject-and-chase loops | MEDIUM | Deterministic rules first |
| Reject reasons as one-tap presets ("blurry", "missing pages", "wrong month") | Faster rejections, consistent client messaging | LOW | Plus free-text note |
| Bulk approve for connected-source items (Plaid/Truv data is machine-sourced) | Staff should not manually approve 6 statements from the bank itself | LOW | Auto-mark "verified by provider" but still allow reject |
| Auto-compress/split to meet Logics' 6 MB limit | Removes a known friction | MEDIUM | Server-side PDF handling; may be heavy on Workers. See PITFALLS |
| Document-to-Logics category mapping per firm | Files land in the right Logics folder | LOW | Config table: ResSpark doc type -> `FileCategoryID` |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Auto-approval by AI | "No staff time at all" | Penalty-of-perjury context; one wrong bank statement undermines a submission | AI suggests; human approves |
| Full DMS (folders, versioning UI, retention rules) | SmartVault, TaxDome, Paperless-ngx | Logics already stores the case file | Store until pushed plus a retention setting |
| In-app document editor/annotation | Looks modern | Zero value to this workflow | Download and re-upload |
| Redaction tooling | Compliance instinct | Large scope | Revisit when a client asks |

**Copy from:**
- Review panel structure and rejection-with-note semantics: `seziro-team/gather` `apps/web/src/components/review-panel.tsx`, `apps/web/src/lib/review.ts`. `PATTERN`.
- PDF preview: `wojtekmaj/react-pdf` (11,190, MIT), `mozilla/pdf.js` (53,990, Apache-2.0). `COPY`.
- Classification/tagging concepts: `paperless-ngx/paperless-ngx` (46,485, GPL-3.0). `PATTERN`.

---

### (e) E-Signature

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Embedded signing in the client portal, no second login | Transcript pain: email-only links, zooming and scrolling on phones | MEDIUM | `@docuseal/react` `DocusealForm` |
| Staff copyable signing link in addition to email/SMS | Transcript requirement ("I can't copy the link") | LOW | Each submitter has an `embed_src` URL built from its slug (confirmed in DocuSeal source `serialize_for_api.rb`; returned when `with_urls` is on). Set `send_email: false` and use your own link, or leave on for redundancy |
| Template per form (POA 2848, 8821, engagement letter, fee agreement, 433-A attestations) with prefilled client name/address/case ID | Transcript: "map it out for tax returns"; prefilled fields reduce errors | MEDIUM | `values` on submitter; templates built once with the DocuSeal builder, referenced by `template_id` |
| Webhook for completion; fetch and store signed PDF; push to Logics | Closing the loop into the case file | MEDIUM | `form.completed` webhook; download signed document from the API |
| Audit trail / signing certificate retained | Legal defensibility | LOW | DocuSeal produces it; store with the signed PDF |
| Mobile-friendly signing (large fields, auto-zoom) | Transcript | LOW | DocuSeal embedded form is mobile optimized |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| DocuSeal-native SMS delivery of signing request (`send_sms: true`, E.164 phone) | Gives an SMS path without owning an SMS provider (PROJECT.md currently has no SMS key) | LOW | Confirmed in DocuSeal API schema. Cloud plan feature and cost: verify |
| Phone/email 2FA on signing (`require_phone_2fa`, `require_email_2fa`) | Extra assurance for POA and fee agreements | LOW | Confirmed in DocuSeal API schema; adds friction, optional per template |
| Signing step auto-unlocks only after other steps (e.g., after address confirmed so address field is prefilled correctly) | Fewer wrong signatures | LOW | Portal step ordering |
| Generate signed copy of the 433-A worksheet attestation | Practitioners already sign engagement documents; adds nothing to IRS submission | MEDIUM | **Defer.** Do not mix with official IRS forms |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Building our own e-sign engine | "Rip off DocuSign" | Legal validity, certificates, tamper-evidence, years of edge cases | DocuSeal cloud API or self-host unmodified |
| Voice-verified signing, Stripe Identity (Zack's other product) | Wow factor | Explicitly out of scope in PROJECT.md | Separate product |
| Signing official IRS 433-A inside our flow | Obvious temptation | Signed under penalty of perjury by the taxpayer, normally prepared and submitted by a practitioner using their own forms tool | Worksheet for staff; practitioner owns the form |
| Forking DocuSeal/Documenso source | Customization | AGPL obligations for a resold product | Use cloud API or an unmodified container |

**Copy from:**
- `docusealco/docuseal-react` (69 stars, MIT, pushed 2026-05-12) for `DocusealForm` / `DocusealBuilder`. `COPY`.
- `docusealco/docuseal` (18,690, AGPL-3.0) as the **service**. `SERVICE`.
- Alternative `documenso/documenso` (15,380, AGPL-3.0). `SERVICE`.
- Avoid `opensignlabs/opensign` (7,083): license is unrecognized (`NOASSERTION`).
- Anvil (raised in transcript) is hosted and paid; DocuSeal wins on cost and openness.

---

### (f) 433-A / 433-A(OIC) / 433-F Data Capture and Pre-Population

**Forms in scope (live IRS PDFs read 2026-10-10):**

| Form | Rev. | Who uses it | Structure (verified) |
|---|---|---|---|
| **433-A** | 6-2026 | Revenue Officer / field collection, individuals | S1 Personal; S2 Employment (lines 4a to 4h taxpayer, 5a to 5h spouse); S3 Other Financial; S4 Personal Assets (lines 12 to 14e: cash, bank accounts, investments, and so on); S5 Monthly Income (lines 21 to 35) and Expenses (36 to 51); S6 Business; S7 Business income and expenses |
| **433-A (OIC)** | 4-2026 | Offer in Compromise | S1 Personal and Household; S2 Employment; S6 Business Income and Expense (6 to 12 month averaging allowed); S8, S9 Other; S10 Signatures. Monthly household income and expense lists, then Remaining Monthly Income (Box F) and Future Remaining Income (Boxes G, H). Requires **3 most recent complete months of personal statements and 6 months of business statements** |
| **433-F** | 7-2024 | Collection Information Statement (shorter) | A Accounts/Lines of credit; B Real estate; C Other assets; D Credit cards; E Business info; F Employment (a current pay stub can replace the section); G Non-wage household income; H Monthly necessary living expenses, with supporting documents per line |

Note: ResSpark's existing `FinancialData` mirrors 433-A. 433-F adds credit cards and lines of credit, which `FinancialData` does not hold. 433-F is a *subset view* of the 433-A data plus those extra fields. 433-A(OIC) uses the same facts but a different layout and an OIC-specific future-income calculation.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Staff-facing pre-population view: income, expenses, assets, grouped as on the form, each value with its source badge (Plaid, Truv, Logics, intake, uploaded doc, staff entered) | IRSLogics and PitBullTax both auto-populate forms; staff need to see where a number came from | HIGH | Read-only default, editable with required reason; audit every override |
| Deterministic engine drives the numbers (existing `determination.py`, IRS standards from DB, county from Smarty) | CLAUDE.md: no LLM or heuristics in the math | MEDIUM | Preserves NULL = unknown vs 0 = known zero. Unknown required values block evaluation |
| "Proposed vs confirmed" separation: bank-derived numbers are proposals until staff confirm | Category heuristics are not facts; staff sign off under perjury regime | MEDIUM | Engine only reads confirmed values |
| Show IRS Standards for the client's county and the allowed-vs-actual comparison | Transcript: standards per county are the point | MEDIUM | Already in repo; surface it |
| Show the resolution-path recommendation and the math | Transcript: "they can see the math" | LOW | Already in repo; present in UI |
| Export as worksheet (PDF/CSV) for staff and for attaching to the Logics case | Logics has no structured-write endpoint for 433-A | MEDIUM | Not the official form. Mark clearly "Screening worksheet. Not an IRS form." |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Evidence drill-down on each line (the exact transactions or stubs that produced the number, with month-by-month breakdown) | A practitioner who signs under penalty of perjury needs defensible provenance; nobody else shows it | HIGH | Store `source_refs[]` per proposed value (transaction IDs, statement IDs) |
| Conflict flags (payroll vs deposits, rent in bank vs housing answer, missing bank implied by direct deposit, vehicles listed vs car-payment transactions) | Finds the "forgot to mention" items | MEDIUM | Flags only; no auto-fix |
| Form selector hint by resolution path (IA via ACS, RO case, OIC) | Staff pick 433-F vs 433-A vs 433-A(OIC) correctly | LOW | Domain heuristic; MEDIUM confidence; leave to staff, show hint |
| Multi-month averaging for variable/self-employed income (3, 6, 12 months selectable) | OIC allows 6 to 12 month averages | MEDIUM | Selection recorded in the evidence trail |
| Prefill the existing 32 intake questions from connected data | Less typing for client | MEDIUM | See (b) |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Auto-fill and generate the *official* IRS 433-A/OIC/F PDFs | Looks like the finish line | Three forms, three revision cycles per year, signature under perjury; PitBullTax and Logics are the incumbents here | Worksheet export. Revisit only if firm asks |
| LLM-categorized expenses feeding the calculation | "AI will do it" | Violates deterministic-math rule; unexplainable | Plaid PFC + deterministic mapping table; staff confirm |
| Auto-submit to IRS | End-to-end dream | IRS offers no such API for this flow; legal exposure | None |
| Owen & Dax-style AI strategy report (transcript-driven best outcome) | Andrew showed it | Explicitly deferred; different product | Out of scope |
| Replace Logics' Financial Questionnaire | Duplication | Logics already auto-populates its own 433-A | Feed Logics with documents and worksheets |

##### 433-A Line-Item Mapping: What Plaid and Truv Can Feed

Line numbers are 433-A Rev. 6-2026 (verified). 433-A(OIC) and 433-F label the same facts differently (by name, not by the same numbers). "FD" = field name in `src/financial_data.py`. Reliability: **A** = machine-sourced, high trust; **B** = machine-sourced, needs staff confirmation (heuristic or ambiguous); **C** = not available from either provider.

**Income (Section 5, lines 21 to 35)**

| Line | Item | FD field | Source and method | Reliability |
|---|---|---|---|---|
| 21, 22 | Wages (taxpayer, spouse) | `gross_wages_taxpayer`, `gross_wages_spouse` | Truv: average `gross_pay` per stub converted by `pay_frequency` (periods/year ÷ 12), or `gross_pay_ytd` ÷ months elapsed. Cross-check against Plaid `INCOME_SALARY` deposits (net) | A (Truv); assignment of employer to taxpayer or spouse needs staff/client input |
| 23 | Interest and dividends | `interest_dividends_royalties` | Plaid `INCOME_INTEREST_EARNED`, `INCOME_DIVIDENDS` over window ÷ months | B |
| 24 | Net business income | `net_business_income` | Plaid `INCOME_CONTRACTOR`, `INCOME_GIG_ECONOMY` give *gross receipts* only; net needs expenses (P&L or Schedule C upload) | B for gross, C for net |
| 25 | Net rental income | `net_rental_income` | Plaid `INCOME_RENTAL` gives gross rent; net needs expenses | B for gross |
| 26 | Distributions (K-1, IRA, etc.) | `distributions_income` | Not categorized by Plaid; look for `TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS` as a hint only | C (hint only) |
| 27, 28 | Pension | `pension_income` | Plaid `INCOME_RETIREMENT_PENSION` | B |
| 29, 30 | Social Security | `social_security_income` | No dedicated PFC category; detect recurring government deposits by merchant text (for example "SSA TREAS 310"), then confirm | B (heuristic) |
| 31 | Child support received | `child_support_received` | Plaid `INCOME_CHILD_SUPPORT` | B |
| 32 | Alimony received | `alimony_received` | No PFC category; staff confirm from intake | C |
| 33, 34 | Other income | `other_income` | Plaid `INCOME_UNEMPLOYMENT`, `INCOME_LONG_TERM_DISABILITY`, `INCOME_MILITARY`, `INCOME_OTHER` | B |
| exclude | Not income | n/a | `TRANSFER_IN_*`, `LOAN_DISBURSEMENTS_*`, `INCOME_TAX_REFUND` | A (exclusion rule) |

**Expenses (Section 5, lines 36 to 51)**: the IRS allows *National Standards* for food/clothing/misc and out-of-pocket health care, and *Local Standards* for housing/utilities and vehicles (lesser of actual or standard). Actuals therefore matter only where noted.

| Line | Item | FD field | Plaid source | Truv source | Reliability and note |
|---|---|---|---|---|---|
| 36 | Food, clothing, misc | none (National Standard) | `FOOD_AND_DRINK_GROCERIES`, `GENERAL_MERCHANDISE_*`, `PERSONAL_CARE_*` | none | Informational only. Used if staff want to justify exceeding the standard |
| 37 | Housing and utilities | `actual_housing_utilities` | `RENT_AND_UTILITIES_RENT`, `LOAN_PAYMENTS_MORTGAGE_PAYMENT`, `RENT_AND_UTILITIES_GAS_AND_ELECTRICITY`, `_WATER`, `_SEWAGE_AND_WASTE_MANAGEMENT`, `_INTERNET_AND_CABLE`, `_TELEPHONE`, `_OTHER_UTILITIES` | none | B (property tax/insurance paid through escrow are invisible; ask) |
| 38 | Vehicle ownership | `actual_vehicle_loan_lease` | `LOAN_PAYMENTS_CAR_PAYMENT` | none | B; ties to `vehicle_count` and vehicle docs |
| 39 | Vehicle operating | `actual_vehicle_operating` | `TRANSPORTATION_GAS`, `_PARKING`, `_TOLLS`, `GENERAL_SERVICES_AUTOMOTIVE`; auto insurance is `GENERAL_SERVICES_INSURANCE` (ambiguous with other insurance) | none | B |
| 40 | Public transportation | `actual_public_transportation` | `TRANSPORTATION_PUBLIC_TRANSIT` | none | A to B |
| 41 | Health insurance premiums | `actual_health_insurance_premiums` | `GENERAL_SERVICES_INSURANCE` (cannot distinguish health from other) | `deductions[]` with `category: benefit`, reading the deduction `name` to separate health from dental, vision, FSA | B (Truv usually better than Plaid for payroll-deducted premiums) |
| 42 | Out-of-pocket health care | none (National Standard) | `MEDICAL_*` | none | Informational only |
| 43 | Court-ordered payments | `actual_court_ordered_payments` | No PFC category; support payments appear as transfers or "OTHER" | `deductions[]` with `category: garnishment` (payroll garnishments and support withholding) | B (Truv) / C (Plaid) |
| 44 | Child/dependent care | `actual_child_dependent_care` | `GENERAL_SERVICES_CHILDCARE` | none | B |
| 45 | Life insurance (term only allowed) | `actual_life_insurance_premiums` | `GENERAL_SERVICES_INSURANCE` (ambiguous) | `benefit` deductions by name | C to B; term vs whole life must come from the client |
| 46 | Current-year taxes (income and FICA) | `actual_current_taxes` | none (do not infer from bank) | `deductions[]` categories `federal`, `state`, `local`, `socialsec`, `medicare` per stub -> monthly | A (Truv); self-employed estimated payments: Plaid `GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT` as B |
| 47 | Secured debts | `actual_secured_debts_other` | `LOAN_PAYMENTS_*` (car and mortgage handled above; personal and student loans only if secured or government-guaranteed student loans, which require staff judgment) | `retirement` category only if loan repayment | B; do **not** include `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` automatically |
| 48 | Delinquent state or local taxes | `actual_delinquent_state_local_tax` | `GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT` to a state/local agency recurring | none | B |
| 49 | Other expenses (employer-required retirement, union dues) | `actual_secured_debts_other` or separate | none | `retirement` deductions (required vs voluntary cannot be determined), `other` by name | C to B; voluntary 401(k) is not an allowable expense, so staff must classify |
| exclude | Not expenses | n/a | `TRANSFER_OUT_*`, `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` (card purchases are categorized individually), payments **to the IRS** (these are what the resolution replaces) | n/a | A (exclusion rule) |

**Assets and personal info (Sections 1, 2, 4)**

| Line(s) | Item | FD field | Source | Reliability |
|---|---|---|---|---|
| S1 | Name, DOB, address, marital status | `filing_status_married`, `county_of_residence` | Logics `Case/CaseInfo` (FirstName, LastName, DOB, Address, MaritalStatus) + Smarty USPS-validated address and county | A |
| 4a to 4c, 4e, 4f, 4h | Employer name, address, phone, time with employer, occupation, pay period | n/a (display) | Truv `company.{name,address,phone}`, `start_date` / `original_hire_date`, job title if present, `pay_frequency`. Spouse employer equivalent 5a to 5h | A |
| 4d, 4g | OK to contact employer; dependents claimed | `dependents_count` | Client input (intake) | C |
| 12 | Cash on hand | `cash_and_bank_balances` | Client input | C |
| 13a to 13d | Bank accounts: type, bank name/address, account number, balance | `cash_and_bank_balances` | Plaid accounts: subtype (checking/savings), institution name, **mask only** (last 4), current and available balance at pull time. Full account number comes from statement PDF | A for type, name, balance; C for full number |
| 14a to 14d | Investments | `investment_accounts_net` | Not purchased (no Plaid Investments); parse uploaded statements or intake | C (via upload) |
| S4 | Retirement, life insurance cash value, real property, vehicles, other assets | respective FD fields | Intake + uploaded docs (existing parser); Truv `retirement` deductions show contributions, not balances | C |
| S6 and S7 | Business income and expenses | `net_business_income` | Plaid for business bank accounts (tagged), plus P&L upload | B/C |

**Copy from (no OSS 433-A project exists):**
- Category taxonomy: Plaid PFCv2 CSV `https://plaid.com/documents/pfc-taxonomy-all.csv` (16 primary categories, roughly 100+ detailed). Use it as the key of a **SQL mapping table** (`pfc_detailed -> form_line`), kept in the schema/seed files in line with the "standards data in SQL, not Python" rule. All new Plaid customers after Dec 2025 are on PFCv2; the `v1` taxonomy is the legacy default for older customers.
- Rules-based categorization override pattern (payee rules): `actualbudget/actual` (29,421, MIT). `PATTERN`.
- Worksheet PDF generation if wanted: `PDFme/pdfme` (4,872, MIT, active 2026-10-09). `COPY`. `Hopding/pdf-lib` (8,654, MIT) is stable but **last pushed 2024-07-17**.
- IRS PDF form-filling approach (for the deferred official-form feature): `ustaxes/UsTaxes` (1,675, AGPL-3.0). `PATTERN`.
- Bank statement / ledger and money-formatted tables: `bigcapitalhq/bigcapital` (3,931, AGPL-3.0). `PATTERN`.
- Only tax-resolution repo found: `jup313/irs-financial-calculator` (1 star, MIT, 2026-03-08, "self-hosted IRS tax resolution calculator with live IRS standards"). Unvetted; skim for standards-ingest ideas, do not depend on it.

---

### (g) Reminders and Chasing

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| One-click manual resend of the same link (email and copyable) | TaxDome one-click reminders; transcript | LOW | Writes an event; rate limited |
| Automated email reminders on a cadence that **stops itself** when everything required is done | Clustdoc, Pipefile, Gather all do this | MEDIUM | Cadence config per request (every N days; escalating ladder; chosen weekdays). Stop on completion or revocation |
| Overdue surfacing on staff dashboard | Project requirement | LOW | Derived from `due_at` |
| Quiet hours and sending in the client's timezone | Gather's notable detail; reduces complaints | MEDIUM | Timezone from Smarty address/state |
| Email deliverability setup (SPF, DKIM, DMARC) | Gather: "reminders in spam is the failure nobody notices" | LOW | Documented setup checklist and a test-send command |
| Respect opt-outs and SMS consent | Logics has `SMSPermit` and a Stop SMS Permission endpoint | LOW | Check before any SMS |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Provider-delivered SMS reminders, with no own SMS provider (Plaid Hosted Link `delivery_method: sms`, Truv `notification_settings`, DocuSeal `send_sms`) | Delivers a texted link without the team owning Twilio/TCPA responsibility for their own sends | LOW | Each provider sends its own; ResSpark records "sent" events |
| "Stuck" detector: no progress for N hours after open -> staff alert with the last step reached | Targets the babysitting problem in the transcript | MEDIUM | Uses `last_seen_at` and `current_step` from (a) |
| Digest to the assignee ("3 requests waiting on clients, 1 overdue") | Replaces the chase list | LOW | One daily email |
| Logics activity note per reminder | Keeps the case timeline complete | LOW | Throttle: only on first reminder and on escalation |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Own SMS sending in v1 | Clustdoc/Pipefile have it | No provider key; consent (TCPA) and 10DLC registration lead time; explicitly out of scope | Provider-sent SMS plus copyable link |
| Aggressive escalation ladders that email 5+ times | "Make them respond" | Spam complaints, client annoyance, deliverability damage | Max 3 reminders, then staff alert for a phone call |
| Voice robocalls | Chase everything | Regulatory and trust issues | Human call triggered by the stuck-detector |
| AI-written reminder copy per client | Novelty | Inconsistent tone on a compliance-flavoured message | Fixed reviewed templates |

**Copy from:**
- Cadence design (every N days / escalating ladder / weekdays, client timezone, quiet hours, stop-on-complete): `seziro-team/gather` `packages/reminders` and `apps/web/src/lib/reminders.ts`. `PATTERN`.
- Scheduling: Supabase `pg_cron` (extension from `citusdata/pg_cron`, 3,905 stars, PostgreSQL license) or Cloudflare Worker Cron Triggers. `COPY`/platform.
- Email templates: `resend/react-email` (19,827, MIT). `COPY`.
- Decision still open: which outbound email service sends client links and reminders (Resend vs Cloudflare email vs other). PROJECT.md lists no email key.

---

## Feature Dependencies

```
Staff auth (Supabase)
    └──requires──> Case lookup (Logics Find*/CaseInfo) ──requires──> Logics credentials (not in repo yet)
                        └──requires──> Request builder + contact validation
                                            └──requires──> Token link + client portal shell
                                                                ├──> Address confirm (Smarty) ──> county ──> IRS Local Standards
                                                                ├──> Bank connect (Plaid/Teller interface) ──> webhooks ──> transactions + statements
                                                                ├──> Payroll connect (Truv) ──> webhooks ──> stubs, W-2s, income
                                                                ├──> Upload items (Storage + TUS)
                                                                └──> E-sign (DocuSeal template + webhook)
Live status dashboard ──requires──> events table + Realtime + provider webhooks
Document review ──requires──> Uploaded/connected items + signed URLs
Push to Logics ──requires──> Review (approved items) + file size handling (6 MB) + FileCategoryID mapping
433-A pre-population ──requires──> Smarty county + IRS standards in DB + Plaid PFC->line mapping table + Truv stub parsing + staff confirm UI
                      ──enhances──> Evidence drill-down, conflict flags
Reminders ──requires──> Email service + request due dates + client timezone
Stuck-detector ──requires──> Client heartbeat (current_step, last_seen_at)
Identity gate (DOB) ──requires──> Logics CaseInfo DOB cached at request creation
```

### Dependency Notes

- **Everything client-side requires the token link and portal shell.** Build the shell with a stub step first; plug providers in one at a time.
- **Live status requires webhooks**, which require a deployed public URL. So deployment to Cloudflare must precede provider integration, not follow it (provider sandboxes cannot call localhost).
- **Push to Logics requires review semantics** (approved-only), file-size handling, and a local record of pushes because Logics offers no list-documents endpoint.
- **433-A pre-population requires three independent inputs**: Smarty county (so standards can load), the Plaid mapping table, and Truv stub parsing. The first is cheap and unblocks the engine; the others can arrive in separate phases.
- **Provider-delivered SMS conflicts with "own SMS"**: do not build both; if an SMS provider is later chosen, the provider events remain valid.
- **Session replay conflicts with the client portal** because the portal shows PII and financial data.

---

## MVP Definition

### Launch With (v1: Monday Oct 12 demo plus 2-3 day iterations)

The core value is "send link, client connects, docs appear in the Logics case".

- [ ] Staff sign-in, Logics lookup (case ID, phone, email) with confirm card, contact validation
- [ ] Request builder with fixed templates; send + copyable link; revoke/regenerate
- [ ] Token portal: firm/agent header, step list, save/resume, mobile layout
- [ ] Plaid bank connect (hosted link first), 6-month transactions + statements, manual-upload fallback
- [ ] Truv payroll connect with multi-employer sandbox proven, stubs + W-2 retrieval, upload fallback
- [ ] Smarty address confirm -> county
- [ ] Document upload per item with resumable uploads
- [ ] DocuSeal embedded signing + copyable link
- [ ] Live status on the dashboard (Realtime/poll) with event timeline
- [ ] Per-item approve/reject; push approved items to Logics + activity note; local push ledger
- [ ] Deploy to Cloudflare + Supabase on a real URL; RLS on every table; webhooks verified

### Add After Validation (v1.x)

- [ ] 433-A pre-population view with source badges and proposed-vs-confirmed values (needs Nicole and Sandra interviews on layout; transcript says to start here after docs flow works)
- [ ] Mapping table for Plaid categories -> 433-A lines, Truv deduction mapping, evidence drill-down
- [ ] Automated email reminders with stop-on-complete; stuck-detector alert
- [ ] Teller as second bank provider behind the interface (one-line swap proven)
- [ ] DOB identity gate on by default
- [ ] Statement coverage and staleness checks; reject-reason presets
- [ ] AI classification suggestions with redaction

### Future Consideration (v2+)

- [ ] 433-F and 433-A(OIC) layouts as alternate views of the same data
- [ ] Spanish localization
- [ ] Multi-tenant white-label for other firms (Alleviate and others)
- [ ] Logics polling to auto-create requests from case status changes
- [ ] Official form PDF generation (only if a firm asks)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Token link + portal shell + step list | HIGH | MEDIUM | P1 |
| Logics lookup + confirm card | HIGH | MEDIUM | P1 |
| Request builder + templates (seeded) | HIGH | MEDIUM | P1 |
| Plaid connect (6 months + statements) | HIGH | MEDIUM | P1 |
| Truv connect (multi-employer) | HIGH | MEDIUM | P1 |
| Live status + event timeline | HIGH | MEDIUM | P1 |
| Approve/reject + push to Logics | HIGH | MEDIUM | P1 |
| DocuSeal embedded + copyable link | HIGH | MEDIUM | P1 |
| Smarty address -> county | MEDIUM | LOW | P1 |
| Resumable uploads + manual fallback | HIGH | MEDIUM | P1 |
| Contact validation (email typo, phone) | MEDIUM | LOW | P1 |
| Client "mirror" step view for staff | HIGH | MEDIUM | P1 (cheap once heartbeat exists) |
| 433-A pre-population view | HIGH | HIGH | P2 |
| Plaid -> 433-A mapping table + evidence | HIGH | HIGH | P2 |
| Email reminders with stop rule | MEDIUM | MEDIUM | P2 |
| Teller second provider | MEDIUM | LOW (if interface is right) | P2 |
| DOB identity gate | MEDIUM | LOW | P2 |
| Statement coverage / staleness checks | MEDIUM | MEDIUM | P2 |
| AI classification (redacted) | MEDIUM | MEDIUM | P2 |
| Conflict flags (payroll vs deposits) | MEDIUM | MEDIUM | P3 |
| Worksheet PDF export | MEDIUM | MEDIUM | P2 |
| Spanish | LOW now | MEDIUM | P3 |
| Official IRS form generation | LOW | HIGH | P3 / anti-feature |

**Priority key:** P1 must have for launch; P2 should have, add when possible; P3 future.

---

## Competitor Feature Analysis

| Feature | IRSLogics / PitBullTax | TaxDome / Canopy | Clustdoc / Pipefile / Gather | Our Approach |
|---|---|---|---|---|
| Request builder | Financial Questionnaire (Logics), questionnaires (PitBull) | Requests + templates, jobs | Checklists / form builder | Fixed templates seeded from intake-derived defaults; no editor in v1 |
| No-account client link | Branded portal (login model unclear) | Portal login + app | Magic link | Magic link, expiring and revocable, DOB gate optional |
| Bank / payroll connection | None found | None found | None | **Plaid/Teller + Truv as the main path; upload as fallback** |
| Review | Approve questionnaire data | Client approvals, staff review | Gather: per-item approve/reject | Per-item approve/reject; machine-sourced items pre-verified |
| E-sign | Built-in (weak on phone per transcript) | Native | Clustdoc native; Gather none | DocuSeal embedded + copyable link |
| 433-A pre-population | Yes, inside the product, from questionnaire | No | No | Pre-pop from connected data with source evidence; feeds worksheet to Logics |
| Reminders | SMS thread | One-click and pipeline-driven | Cadence-based, stop on complete (Gather) | Email cadence + provider-sent SMS + stuck alert |
| CRM integration | They are the CRM | Native | Zapier/API | Logics V4 API: find, read, upload, note |
| Status for staff | Case stage | Job status | Request status | Live step-level status + client mirror |

---

## Open Questions and Gaps

1. **Truv multi-employer in one order** is unverified. It is the #1 sandbox spike before the demo (use the `multiple.employments` sandbox login from PROJECT.md).
2. **Plaid Statements coverage** limits the "bank statement PDFs" promise to a short list of institutions. The fallback (upload) must be first-class, not an error state.
3. **Plaid billing for Items** (per-Item monthly subscription for Transactions) is stated from memory, MEDIUM confidence. Confirm in Andrew's dashboard before committing to `/item/remove` as a cost lever.
4. **Outbound email provider** is undecided; reminders and link-sending depend on it.
5. **DocuSeal plan**: cloud (API key, SMS availability, price) vs self-host (AGPL unmodified container, infra to run). Not yet decided in PROJECT.md.
6. **Logics `FileCategoryID` values** for ValorTax are unknown; ask Andrew or call a Logics endpoint if one exposes them.
7. **433-A layout and which of 433-A / 433-F / OIC ValorTax actually uses most** is a question for Nicole and Sandra (the transcript's open action item).
8. **Competitor claims** for Canopy, TaxDome and Pipefile come from vendor pages and third-party roundups; verify with a free trial if any of them becomes a reference point for pricing or positioning.
9. **Gather, 17 open issues, alpha**: re-check its status before the next milestone; if it earns real adoption, a license conversation or a rewrite of its patterns may shift.

## Sources

- GitHub API reads on 2026-10-10 for stars, license, push date, archived flag: `seziro-team/gather`, `docusealco/docuseal`, `docusealco/docuseal-react`, `documenso/documenso`, `opensignlabs/opensign`, `satnaing/shadcn-admin`, `plaid/react-plaid-link`, `plaid/pattern`, `plaid/quickstart`, `plaid/plaid-node`, `truvhq/quickstart`, `tellerhq/teller-connect-react`, `ustaxes/UsTaxes`, `frappe/erpnext`, `bigcapitalhq/bigcapital`, `paperless-ngx/paperless-ngx`, `actualbudget/actual`, `transloadit/uppy`, `tus/tus-js-client`, `react-dropzone/react-dropzone`, `wojtekmaj/react-pdf`, `mozilla/pdf.js`, `Hopding/pdf-lib`, `PDFme/pdfme`, `resend/react-email`, `panva/jose`, `mailcheck/mailcheck`, `catamphetamine/libphonenumber-js`, `supabase/realtime`, `citusdata/pg_cron`, `stonith404/pingvin-share`, `jup313/irs-financial-calculator`. (HIGH for the facts stated)
- Gather README and tree: https://github.com/seziro-team/gather (HIGH for what it claims; not independently verified as working)
- IRS Form 433-A (Rev. 6-2026): https://www.irs.gov/pub/irs-pdf/f433a.pdf (MEDIUM: parsed by tool)
- IRS Form 433-A (OIC) (Rev. 4-2026): https://www.irs.gov/pub/irs-pdf/f433aoi.pdf (MEDIUM: section numbering partially extracted; some sections not listed by the parser)
- IRS Form 433-F (Rev. 7-2024): https://www.irs.gov/pub/irs-pdf/f433f.pdf (MEDIUM)
- Plaid Personal Finance Category taxonomy CSV: https://plaid.com/documents/pfc-taxonomy-all.csv and https://plaid.com/docs/transactions/pfc-migration/ (HIGH for category names)
- Truv pay statement and income report objects: https://docs.truv.com/api-reference/statements/object, https://docs.truv.com/api-reference/user-income-and-employment-reports/object (MEDIUM)
- DocuSeal API schema (`send_sms`, `require_phone_2fa`, `embed_src`) via Context7 `/docusealco/docuseal` (MEDIUM)
- Logics V4 API doc: `Logics_API_Documentation.docx.md` in this repo (HIGH for what exists)
- IRSLogics: https://www.irslogics.com/irslogics-blog/top-tax-resolution-software-usa (LOW to MEDIUM: vendor marketing)
- PitBullTax: https://www.pitbulltax.com/page/pitbulltax-vs-the-competition-comparing-tax-resolution-software.html (LOW to MEDIUM: vendor marketing)
- TaxDome: https://taxdome.com/client-requests (MEDIUM)
- Pipefile reminders: https://pipefile.com/features/reminders (LOW: little detail)
- Clustdoc: https://clustdoc.com/features/signature-workflow/ and /features/ (LOW to MEDIUM)
- Canopy / SmartVault / Liscio / Karbon comparisons: https://www.finlens.app/blogs/best-tax-client-portal-software-paperless-firms-2026 (note: published by a vendor that sells an adjacent product), https://ustechautomations.com/resources/blog/karbon-vs-canopy-vs-taxdome-2026, https://customer-portals.com/articles/client-portal-for-accountants/ (LOW)
- Call transcript `transcript.md` and `.planning/PROJECT.md` (primary source for the user's intent)

---
*Feature research for: tax-resolution document-collection platform (ResSpark)*
*Researched: 2026-10-10*
