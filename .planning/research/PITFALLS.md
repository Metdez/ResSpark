# Pitfalls Research

**Domain:** Tax-resolution client document-collection platform (staff portal + token-link client portal; Plaid/Teller bank data, Truv payroll data, DocuSeal e-sign, IRS Logics CRM push; Cloudflare Workers + Supabase)
**Researched:** 2026-10-10
**Confidence:** MEDIUM-HIGH (vendor behavior and federal text verified against live docs this session; legal conclusions are research, not legal advice; items tagged [VERIFY] need a quick sandbox test or counsel/CPA confirmation)

Scope note: this file does not repeat the items already in `.planning/codebase/CONCERNS.md` (merged `.gitignore` line, tracked `dist/`, 500-line files, hard-coded IRS constants, zero-default `FinancialData`, unauthenticated `case_api.py`, no RLS in `database_schema.sql`, client docs sent to OpenRouter unredacted). Where a new pitfall touches one of them, it says "extends CONCERNS" and maps the existing fix to a phase.

## Phase vocabulary used below (remap to the real roadmap)

| Tag | Phase | Contents |
|-----|-------|----------|
| **P1** | Foundation and hygiene | `.gitignore`/`dist` fix, Worker + Supabase skeleton deployed to a real URL on day 1, schema + RLS + audit log, staff auth with MFA, token-link design, compliance baseline docs |
| **P2** | Staff portal + Logics | Case lookup and confirm, request builder, status dashboard, push to Logics |
| **P3** | Client portal core | `/c/:token` shell, step list, Smarty address, uploads, intake pre-fill |
| **P4** | Bank connection | Plaid (Hosted Link), provider interface, Teller as second implementation |
| **P5** | Payroll connection | Truv orders, multi-employer |
| **P6** | E-sign | DocuSeal |
| **P7** | 433-A pre-population + AI extraction | Reuses Python/ported engine |
| **P8** | Production gate | Plaid/Truv production access, WISP evidence, retention jobs, pen test, accessibility audit, deliverability, first real client |
| **DEMO** | Mon Oct 12 11:30 cut across P1-P6 | Sandbox and synthetic data only (see C1) |

Confidence tags: **[HIGH]** = read in official docs/regulation this session; **[MED]** = secondary source or partial confirmation; **[LOW]** = recalled/unverified, test before relying on it.

---

## Critical Pitfalls

### C1: Real client PII flows through an environment that has no controls (demo contamination)

**What goes wrong:** The Oct 12 demo is run with a real Logics tenant (`valortax.logiqsapi.com`, the only base URL in the docs; no sandbox is documented) and ValorTax staff "jump in as case manager" (transcript, 1:03). A staff member types a real case ID, ResSpark pulls name, phone, email, address and DOB (`Case/CaseInfo` returns DOB) into an unreviewed Supabase project, and a Create Case Document or Create Activity call writes to a real client's file.
**Why it happens:** Logics has one tenant URL; keys are scoped only by read vs write (`case.read`, `case.write`, `activity.write`); demo pressure.
**How to avoid:** (1) Issue two Logics keys: a read-only key for DEMO and dev, a write key only in the production Worker. (2) Env flag `LOGICS_WRITE_ENABLED=false` by default plus an allowlist of test CaseIDs that the write path enforces in code, not in the UI. (3) Create 2-3 fake cases in Logics for the demo; tell ValorTax in writing to use only those. (4) Plaid sandbox (`user_good`/`pass_good`), Truv sandbox (`goodlogin`/`goodpassword`, `multiple.employments`) and synthetic `Examples/` documents only. (5) No real-client onboarding until the P8 gate (C10) passes.
**Warning signs:** Any Logics POST in Worker logs outside the test allowlist; Supabase rows whose `logics_case_id` is not a test case; a screenshot of real client data in a call recording.
**Phase to address:** P1 (flags, keys, allowlist), DEMO (script), P8 (lift restrictions).

### C2: The client link is the only authentication, and links leak, get scanned, and get forwarded

**What goes wrong:** `/c/:token` is a bearer secret for a page that connects bank accounts and uploads tax documents. Tokens leak through Referer headers to third-party scripts, browser history, analytics and session-replay tools (the transcript shows PostHog session recording in the builder's toolbox), SMS/e-mail link scanners (Outlook Safe Links, iMessage and Slack previews) that GET the URL, forwarded messages, and shared household phones. A one-time token is consumed by the scanner so the real client sees "link expired"; a multi-use token marks the request "opened" before a human ever saw it.
**Why it happens:** "No account, no password" is a core requirement, so teams stop at a random string.
**How to avoid:**
- 128-bit+ random token, store only a SHA-256 hash, `expires_at` (suggest 14 days, staff can extend), `revoked_at`, per-token rate limit and lockout at the Worker.
- Never treat a GET as "opened". Mark opened on the first authenticated interaction (an explicit "Start" tap).
- On first load, exchange the token for a short-lived `HttpOnly; Secure; SameSite=Lax` session cookie, then `history.replaceState` to strip the token from the URL. Send `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex`.
- Step-up check before showing any connected-account data or allowing signature: confirm something staff already know from Logics (last name + ZIP, or last 4 of phone). The landing page shows only firm name, agent name, and first name.
- Block analytics and session replay (PostHog, OpenReplay) on `/c/*` entirely; if used elsewhere, mask all inputs.
- Do not put the token in `completion_redirect_uri` or any URL given to a vendor; use a separate single-use return nonce.
**Warning signs:** "opened" timestamps within seconds of send; the same token hit from several IPs/user agents; token strings visible in any log or analytics event.
**Phase to address:** P1 (token + cookie design, schema), P3 (step-up, headers), P8 (pen test of the token path).

### C3: Supabase RLS and the service-role key are mis-designed for anonymous, token-gated access

**What goes wrong:** Typical failure modes, all verified against Supabase docs [HIGH]: tables in `public` without RLS are readable with the publishable key; `to anon using (true)` hands every row to every visitor; views bypass RLS unless created with `security_invoker`; the `service_role` key bypasses RLS entirely, so one missing `where case_id = ...` in a Worker query leaks another client's file; `user_metadata` is user-editable and must never appear in a policy; storage buckets and `storage.objects` policies are forgotten; Realtime channels broadcast without RLS if left public.
**Why it happens:** The client has no Supabase identity, so developers either open the tables to `anon` with a header-comparison policy, or run everything as service role.
**How to avoid:** Pick one model and write it down:
- **Recommended:** the client never talks to PostgREST. The Worker is the only gateway: it validates the token (C2), then calls Supabase with the service-role key through a single data-access module that always takes `case_id` from the validated session, never from the request body. All client-facing tables have RLS enabled with **no** policy for `anon`. Add a test that connects as `anon` and asserts zero rows on every table.
- Staff use Supabase Auth; policies key on `firm_id` taken from `app_metadata` (not `user_metadata`) via `(select auth.jwt() -> 'app_metadata' ->> 'firm_id')`. Wrap auth calls in `(select ...)` and index `firm_id`/`case_id` (documented performance rule).
- Add `firm_id` to every table now even though v1 is single-firm (cheap now, a migration later).
- Private buckets only; uploads by signed upload URL minted by the Worker per file with a fixed path `firm/case/request/uuid`; downloads by short-lived signed URL; log each issuance. Create views with `security_invoker = true`. Make `audit_events` append-only (revoke UPDATE/DELETE from all app roles).
- Service-role key lives only in Worker secrets. Grep CI for `SERVICE_ROLE` and for any secret in a `VITE_*` variable.
**Warning signs:** A table with `rowsecurity = false` in `pg_tables`; Supabase advisor warnings; a policy containing `true` or `user_metadata`; a Worker query without a `case_id` predicate.
**Phase to address:** P1 (schema + policies + anon-zero-rows test), every later phase (data-access module only), P8 (re-audit with Supabase advisors).

### C4: Webhooks are trusted, double-processed, or silently lost (Plaid, Truv, DocuSeal)

**What goes wrong:** Status never updates, updates twice, or an attacker POSTs a forged "bank connected" event.
**Why it happens / specifics:**
- **Plaid** [HIGH]: verification is optional in Plaid's own words, so tutorials skip it. The proper check is the `Plaid-Verification` JWT (ES256), key from `/webhook_verification_key/get`, `iat` no older than 5 minutes, and a SHA-256 of the **raw body** compared to `request_body_sha256`. The hash is whitespace-sensitive, so a handler that does `await c.req.json()` and re-serializes fails verification. Read `await request.text()` first, verify, then `JSON.parse`.
- **Truv** [HIGH]: `X-WEBHOOK-SIGN` is HMAC-SHA256 over the raw body with the Access Secret. Truv may deliver duplicates (use `webhook_id`), retries 4xx/5xx only 3 times at 30-second intervals, and an endpoint failing for three days after the alert e-mail is disabled with **no replay**. A Worker deploy that returns 500 for an afternoon loses events permanently.
- **DocuSeal** [HIGH]: `x-docuseal-signature` is `timestamp.signature`, HMAC-SHA256 over `${timestamp}.${rawBody}` with 5-minute tolerance. Document URLs in the payload expire after 40 minutes by default (see C13).
- Plaid webhooks carry no event id, so dedupe on a natural key (`webhook_code` + `link_session_id`/`item_id` + body hash).
**How to avoid:** One `/webhooks/:provider` route per vendor; verify before any DB write; insert `(provider, dedupe_key)` into a `webhook_events` table with a unique index and return 200 immediately; do real work after the response (`ctx.waitUntil` or a Cloudflare Queue so retries are ours, not the vendor's). Add a **reconciliation job** (Cron Trigger) that polls Plaid `/link/token/get` (public token retrievable for 6 hours after session end [HIGH]), Truv `GET /v1/orders/{id}/`, and DocuSeal submissions for every request still "in progress", so a lost webhook self-heals. Staff UI shows "last synced" per request.
**Warning signs:** Requests stuck "in progress" while the client says done; duplicate documents in a case; verification code that passes in a unit test using pretty-printed JSON but fails against real Plaid.
**Phase to address:** P1 (verify helper + `webhook_events` + cron skeleton), P4/P5/P6 (each provider adapter), P8 (alert on webhook failure rate).

### C5: Plaid Link mode, token lifetimes, OAuth, and the "delivery_method: sms" assumption

**What goes wrong:** The plan in PROJECT.md uses `hosted_link.delivery_method = "sms"`. Plaid's docs [HIGH]: Link Delivery (SMS/e-mail by Plaid) is **beta**, requires contacting the account manager, carries a **per-link fee**, and the **Sandbox does not send SMS or e-mail at all**. So it cannot be demoed and may not be enabled in production.
Other traps [HIGH unless noted]:
- Hosted Link default lifetime is 30 minutes when you deliver the URL yourself (24 h for Plaid SMS, 7 days for Plaid e-mail). A link generated when staff click "send" is dead by the time the client taps it the next day.
- `completion_redirect_uri` fires on success **and** on exit; it must not mark the bank as connected. Only `SESSION_FINISHED` (`status: success`, `public_tokens[]`) or `/link/token/get` does.
- You must store `link_token` against the internal case/request id; it is the only way to attribute the returned `public_token` to the right client.
- Embedded Link (`react-plaid-link`) inside webviews (Gmail, Facebook, Messages in-app browsers) fails on OAuth banks unless a `redirect_uri` is configured and Link is re-initialized after redirect; Plaid warns that browsers without pop-up support break mobile web OAuth. Redirect URIs must be HTTPS in Production and registered in the Dashboard; localhost HTTP works only in Sandbox.
- Chase requires the Plaid security questionnaire (unless on a Trial plan), PNC requires the current MSA [HIGH]. Sandbox OAuth is a single generic flow, so none of this shows up before Production.
- Exchange the `public_token` immediately inside the webhook handler; do not queue it for later [MED].
**How to avoid:** Use **Hosted Link, even from inside our own portal**. The client page has a "Connect bank" button that calls the Worker, which creates a *fresh* link token on each tap (`url_lifetime_seconds` 900-1800, `completion_redirect_uri` = a return route with a single-use nonce, `webhook` = our Worker) and opens `hosted_link_url`. This avoids OAuth re-initialization code, `react-plaid-link`, and stale links in one move. Give the agent a copy-link button for the portal URL (ours, long-lived), never for the Plaid URL. Do not depend on Plaid-sent SMS for the demo or v1.
**Warning signs:** Client sees a Plaid "link expired" page; "connected" status without a stored access token; QA only ever tested on desktop Chrome.
**Phase to address:** P4 (Hosted Link flow), DEMO (copy-link path), P8 (OAuth/Chase approvals, real-device test on iOS Safari + Gmail in-app browser).

### C6: Statement availability gap, history depth fixed at link time, and 6 months is not 6 PDFs

**What goes wrong:** The core promise is "bank statements appear in the Logics case". Plaid Statements [HIGH]: depository accounts only; covers roughly 40% of US depository accounts (Bank of America, Citi, Fifth Third, Huntington, Navy FCU, Regions, Truist, US Bank, Wells Fargo; **Chase is early access by request**); requires a fallback; billed **when the Item is created** by the number of statements in the requested window whether or not you download them. Credit cards and many credit unions return `PRODUCTS_NOT_SUPPORTED`. If `statements` is in `products` rather than `required_if_supported_products`, a customer at an unsupported bank cannot finish linking at all.
`transactions.days_requested` defaults to **90** and cannot be changed once Transactions is on the Item (max 730) [HIGH]. A default integration silently gives 3 months, and the 6-month decision from the call (Zack: "let's just do six months") is not honored.
Statement cycles do not align with calendar months (the call itself raises this at 22:38), so a 6-month window can yield 5 or 7 PDFs, and the newest month may not be posted yet.
**How to avoid:** Put `transactions: { days_requested: 730 }` or at least 200 in every link token (more history costs only sync time); put `statements` in `required_if_supported_products` with `start_date`/`end_date` padded one month either side. Per account, store a status: `statement_pdf_available | not_supported | uploaded_manually`. For unsupported banks the client portal immediately shows "Upload your last 6 statements for this account" (camera/PDF). A generated PDF from transactions may be offered as a convenience but must be labeled "Transaction export (not a bank-issued statement)" and never filed as one. Budget cost per case from the 6-statement number, not the "$10-14" estimate.
**Warning signs:** Statement count per account in the sandbox is always perfect but production pilots show gaps; staff asking "where is the statement for the credit union account".
**Phase to address:** P4 (link config, per-account status, manual-upload fallback), P2 (staff UI shows gap state), P8 (pilot on 5 real accounts across Chase, BoA, a credit union, a neobank).

### C7: Production access, "tax resolution" categorization, and underwriting

**What goes wrong:** Sandbox works; Production access stalls or is later revoked because the use-case story does not match what the platform actually does.
**Specifics:**
- The call (12:35-16:00) frames the strategy as fitting "a category box" and leaning on "tax preparation" language. That is workable only if it is complete and consistent. Plaid's Data Transparency Messaging shows the end user the data types and use cases you declare in Dashboard Link customization (max three use cases) [HIGH]. If the declared use case, the privacy policy, the consent screen, the Plaid application and the Truv application each describe the product differently, review or later audit fails.
- The accurate description includes facts a reviewer will care about: data goes to a **third-party tax-resolution firm** and into a **CRM**, the client has an **open IRS balance**, and the data supports **Form 433-A (signed under penalty of perjury)**. Omitting them is the classic cause of later termination; stating them plainly and showing the consent screen is what passes.
- Plaid declined by Andrew: consumer-report/credit products (annual contract). The categorized-expense product he described is in that family. Do not build on Plaid categories assuming that product is available (see M7).
- Truv's MSA states the client "represents to have a permissible purpose under the FCRA to obtain an employment report" [HIGH]. A tax-resolution firm must be able to document a permissible purpose (typically written instructions of the consumer). The consent text and audit log have to prove it.
- White-label resale (stated goal): Plaid and Truv contracts are with ResSpark, but end users consent to *a firm*. Ask each vendor in writing whether a multi-firm platform is allowed on the current plan [VERIFY]; it affects P8 and the multi-tenant roadmap, not v1.
- Plaid Trial plan allows 10 Production Items, and removing Items does not give them back [HIGH]. Pilot testing can exhaust it.
**How to avoid:** Write one "Use of data" statement (what, why, who receives it, retention) and reuse it verbatim in: the vendor applications, the client consent screen, the privacy policy, and Link/Bridge customization. Submit the Plaid security questionnaire early (their guidance) because Chase gates on it. Keep a `consents` table (text version, timestamp, IP, UA, case id) written before the first provider screen opens.
**Warning signs:** Different one-line product descriptions in different places; vendor review asking follow-up questions about "who receives the data"; no consent row for a connected Item.
**Phase to address:** P1 (consent text + `consents` table), P4/P5 (Dashboard use-case config), P8 (production applications, written vendor answer on multi-firm use).

### C8: Logics case lookup is ambiguous and the wrong client gets the link

**What goes wrong:** The call's own concern (21:04): "they type in case number, they could get the wrong one". From the API doc [HIGH]: `FindCaseByPhone`, `FindCaseByEmail`, and `FindCase` (last name + phone) all return **arrays** ("list grows over time"); a phone can match several cases (spouse, prior closed case, shared household, a relative who is a second client); `CellPhone`, `HomePhone`, `WorkPhone` are separate fields and the match may be on the wrong one; lookup inputs are sent as **header** parameters, which many proxies and loggers record. A single result is not proof of identity either: a typo'd e-mail address can match a real, different person.
**How to avoid:** Never auto-pick. Always render a confirmation card for every result: full name, `CaseID`, `StatusID` (resolved to a name via config), `CreatedDate`, city/state, masked phone and e-mail, and which field matched; require an explicit "Yes, this is the right client" tap that is written to the audit log with the staff user. Re-fetch `Case/CaseInfo` by `CaseID` at send time (not from the cached list) and refuse if name or contact changed since confirmation. Normalize phone to E.164 and compare digits; lowercase e-mail. Redact lookup values in logs. Block send when the chosen destination (phone or e-mail) differs from what Logics holds unless a staff user confirms the override. Fetch only fields you need; do not persist DOB.
**Warning signs:** More than one result treated as "first one wins"; a client reporting a link for someone else's case; lookup values appearing in Cloudflare logs.
**Phase to address:** P2.

### C9: Logics writes are unsafe by default (no sandbox, no idempotency, no readback, 6 MB)

**What goes wrong:** Create Case Document duplicates on retry, partial pushes, oversized files rejected after the staff member walked away, or files attached to the wrong case.
**Specifics from the doc [HIGH]:** Basic auth (`API Key` as username, `Secret Token` as password; keys carry separate GET/POST permissions; "rotate regularly"); `Documents/CaseDocument` is multipart with a **6 MB per file** cap; responses are `{Success, data:{CaseDocumentID}}`, with only 401/403/500 documented, so there is no documented 429, no rate limit, no idempotency key, no list-documents endpoint and no delete. `FileCategoryID` has no documented lookup endpoint. `ActivityType` values are not enumerated. Mixed types: `CaseID` is String in some tables, Integer in others; some dates are `mm/dd/yyyy`.
**How to avoid:**
- Keep a local **push ledger**: `(document_id, sha256, logics_case_id, state: pending|sent|confirmed|unknown, logics_document_id)`. Only `confirmed` when a 200 returns a `CaseDocumentID`. On timeout/5xx the state is `unknown` and the UI says "may have uploaded; check the case" rather than auto-retrying. Auto-retry only GETs.
- Put the ResSpark document UUID in the `Comment` field and write one summary Activity per batch. This gives humans a visible reconciliation trail even though Logics cannot be queried for documents.
- Push serially (one in flight), with jittered backoff on 5xx. Treat every 401 as "credentials rotated" and raise an admin alert; 403 as "missing scope".
- Enforce the 6 MB limit **before** the staff clicks push: show size per file, auto-compress images on the client (downscale/re-encode JPEG), split PDFs with `pdf-lib` where text PDFs exceed the cap, otherwise ask the client to re-upload. Never silently truncate. Do not attempt Ghostscript-class compression in a Worker.
- Get `FileCategoryID` values and the `ActivityType` string for "Document received" from ValorTax once; store as per-firm config, not code.
- Build the Logics client behind an interface and a fake with recorded fixtures (the repo's existing tests use a fake standards repository for the same reason).
- Never call the Logics endpoints that accept card numbers or CVV (`Add Case Account`); the integration has no reason to.
**Warning signs:** Duplicate files in a Logics case; push marked "done" with no `CaseDocumentID`; files > 6 MB found only at push time.
**Phase to address:** P2 (client + ledger + size gate), P3 (client-side compression), P8 (key rotation runbook).

### C10: The platform becomes part of the firm's FTC Safeguards / IRS WISP obligations and nobody planned for it

**What goes wrong:** ValorTax is a "financial institution" under GLBA; IRS Pub 5708 states tax and accounting professionals are covered regardless of size and must keep a written, accessible WISP [HIGH]. ResSpark is a **service provider** holding tax and bank data. At the first security review the firm will ask for MFA, encryption, logging, incident response, and a contract, and a platform built for a Monday demo has none of the evidence.
**Requirements that translate to engineering [HIGH, 16 CFR 314.4]:** designate a Qualified Individual; written risk assessment; MFA for any individual accessing an information system; encryption of customer information in transit and at rest; secure development and testing of apps; monitor and log authorized-user activity; secure disposal no later than two years after last use unless a legitimate need exists (see C11); service-provider oversight by contract; incident response plan; FTC notification of events affecting 500+ consumers generally within 30 days (IRS, Aug 2026 notice) [HIGH]. Smaller institutions have partial exemptions (314.6) [VERIFY with counsel; do not rely on them]. IRS Pub 4557 is the checklist; Pub 5708 is the WISP template.
**How to avoid:** Treat the evidence as deliverables: staff MFA enforced (Supabase TOTP) from the first staff login; invite-only staff creation (matches "admin can add users"); idle session timeout; every read of a document or connected-account page written to `audit_events` (who, what, when, IP); encryption at rest via Supabase plus application-level encryption of provider access tokens (Plaid access token, Truv link ids, Teller token) with a key that is not in the database; a one-page data-flow diagram and subprocessor list (Cloudflare, Supabase, Plaid, Truv, DocuSeal, Smarty, OpenRouter) ready for the firm's WISP; a short incident-response runbook including who calls the firm and the 30-day FTC clock; a written vendor agreement (data processing and security terms) between ResSpark and ValorTax. Dependency scanning in CI and a pen test before first real client.
**Warning signs:** Staff accounts without MFA; no way to answer "who viewed this bank statement last month"; no subprocessor list.
**Phase to address:** P1 (MFA, audit log, encryption design), P8 (pen test, runbook, agreement, WISP evidence pack). Add a "WISP evidence" checklist to the P8 exit criteria.

### C11: Retention and disposal are undefined, and vendors keep billing and keeping data

**What goes wrong:** Sensitive data lives forever in four places: Supabase Storage and tables, vendor-held Items/Links, backups, and Logics. Costs also accrue.
**Specifics:** Plaid Transactions is **subscription billed**: an Item incurs a monthly fee while a valid access token exists, ended only by `/item/remove` [HIGH]. Statements are billed at Item creation. Truv holds a user/link until deleted [VERIFY exact delete endpoint]. Safeguards requires disposal no later than two years after last use (C10) but nothing stops a shorter policy, and the platform is a staging area (Logics is the system of record), so there is no reason to keep documents long once confirmed in Logics. Supabase backups/PITR retain deleted rows for the backup window; disposal claims must say so.
**How to avoid:** Put retention in config now: after `confirmed` push + staff "case closed", schedule Plaid `/item/remove`, Truv deletion, Storage object deletion at +N days (suggest 30 for documents not yet pushed, 7 after confirmed push); a daily cron executes and logs. Keep the audit log and e-sign audit PDF longer (those are evidence, with no raw financial data). Provide a staff "delete everything for this case now" action and a client-requested deletion procedure. Document backup retention in the WISP evidence pack. Do not use Plaid Transactions as an ongoing feed unless the firm asks (it is the expensive mode).
**Warning signs:** Plaid invoice shows Items for closed cases; Storage growing without bound; no job that ever deletes.
**Phase to address:** P1 (retention config + schema columns), P4/P5 (provider removal calls), P8 (cron + verification).

### C12: PII leaks to an LLM, to logs, and to analytics

**What goes wrong:** Extends CONCERNS (unredacted OpenRouter calls). Beyond that: Worker logs and error trackers capture request bodies; `console.log(payload)` in a webhook handler writes bank data to Workers Logs; session-replay or analytics on client pages captures SSNs and account numbers; an LLM summary is stored and shown without confirmation.
**Specifics:** OpenRouter does not retain prompts unless logging is opted in, but upstream providers differ. Per-request controls exist: `provider: { zdr: true, data_collection: "deny", allow_fallbacks: false }` [HIGH]; without `allow_fallbacks:false` a request can fall back to a non-ZDR endpoint. ZDR also does not cover your own logs. IRC 7216 / Treas. Reg. 301.7216 restricts a *tax return preparer's* disclosure or use of tax return information without written consent [HIGH on rule text]; whether ValorTax's resolution work and this document flow are "tax return information" for a given client depends on whether they also prepare the client's returns [VERIFY with ValorTax's CPA/EA]. Treat the LLM as a disclosure to a third party until counsel says otherwise.
**How to avoid:** Default posture "no raw documents to an LLM". If used (P7): deterministic text extraction first (the existing Python regex classifier), LLM only for ambiguous classification on redacted text (mask SSN/EIN, full account numbers, DOB, addresses) with the per-request ZDR parameters, a fixed allowlisted model/provider set, and a feature flag per firm. Every AI-extracted field is stored with `source = ai`, `confirmed_by`, and blocks determination until a staff user confirms it (this finishes the `ai_flags` TODO in CONCERNS). A structured logger with an allowlist of fields, and a lint rule banning `console.log` of request/response bodies. Disable analytics on `/c/*` (C2).
**Warning signs:** Grep of logs for 9-digit numbers or account-like strings returns hits; OpenRouter "activity" shows non-ZDR providers.
**Phase to address:** P1 (logger + analytics policy), P7 (redaction + ZDR + confirmation gate), P8 (log audit).

### C13: E-signature is "signed" in the UI but not defensible, and not accepted by the IRS for every form

**What goes wrong:** Three distinct failures.
1. **Record keeping.** DocuSeal webhook document URLs expire after about 40 minutes and the vendor says not to store them [HIGH]. If the handler stores the URL instead of fetching and persisting the signed PDF and the audit-log PDF (`audit_log_url`), the evidence vanishes (or lives only in a vendor account).
2. **ESIGN/UETA mechanics.** Valid e-signatures need intent to sign, consent to do business electronically, association of the signature with the record, and retention in a reproducible form (15 U.S.C. 7001, 7006; UETA) [MED, general law]. Where law requires disclosures "in writing" to a consumer (some state tax-resolution/debt-relief contract statutes may), the ESIGN consumer-consent step must precede the signature [VERIFY by state with ValorTax counsel].
3. **IRS acceptance varies by form.** IRS accepts typed-name or third-party-software e-signature on Forms 2848/8821 submitted **online**, but forms mailed or faxed need a wet-ink signature [HIGH]. IRM 10.10.1 lists the forms where e-signatures are accepted in lieu of handwritten ones; Form 433-A, 433-F, 433-B, 656 and 9465 are **not** on that list [HIGH on the list retrieved; confirm current IRM before launch]. Form 433-A is signed under penalty of perjury, so "client e-signed it in the portal" cannot be assumed to be IRS-ready.
Also: a forwarded signing link means anyone can sign (same bearer-link problem as C2), and DocuSeal's own e-mails come from its domain and duplicate ours.
**How to avoid:** Scope the P6 "sign" step to documents ValorTax confirms are valid e-signed (engagement/fee agreement, authorization and consent forms, 2848/8821 for online submission), and make 433-A signature a firm-process decision, not a portal assumption. On `form.completed`/`submission.completed`: fetch the signed PDF and audit PDF immediately, store both in private Storage with SHA-256 and `submission_id`; keep `submission_id`, not URLs. Record an ESIGN consent row (text version, timestamp, IP, UA) before opening the signing frame. Require the C2 step-up check before the frame loads. Create submissions with `send_email: false` and deliver only our own copyable link. Test the embedded frame on iOS Safari and Android Chrome.
**Warning signs:** Signed documents with 404 download links; a signature with no stored consent record; staff asking "can we submit this signed 433-A electronically".
**Phase to address:** P6 (persistence, consent, scope), P8 (counsel review of consent text and state requirements).

### C14: Cloudflare Workers resource model collides with uploads, PDFs, and the Python engine

**What goes wrong:** The first realistic upload or statement batch crashes or times out in production only.
**Limits verified [HIGH]:** Workers memory 128 MB per isolate; CPU per request **10 ms on Free** vs default 30 s (up to 5 min) on Paid; subrequests **50 on Free** vs 10,000 on Paid; 6 simultaneous outgoing connections; max request body 100 MB (Free/Pro), 200 MB (Business); env var size 5 KB; no response-size limit but a 512 MB cache cap; Node APIs require `nodejs_compat` (default from compatibility date 2026-08-04 onward). Cloudflare's own best-practice guidance: stream bodies; `await request.arrayBuffer()` on large payloads will crash the Worker.
**Consequences for this project:**
- `request.formData()` or `arrayBuffer()` of a phone photo plus parsing = memory spikes; ten concurrent uploads can exhaust isolates. **Upload directly from the browser to Supabase Storage with a signed upload URL** so file bytes never touch the Worker. Supabase standard upload is advised for files up to 6 MB, use TUS resumable above that; the Free plan global file limit is 50 MB [HIGH]. Set a per-bucket `file_size_limit` and `allowed_mime_types`.
- Free plan Workers cannot run JWT/ES256 verification plus any PDF work inside 10 ms, and 50 subrequests is easy to exceed pulling 6 statements x N accounts, writing to Supabase, and pushing to Logics. **Use Workers Paid from day 1.** Do bulk jobs (statement download, Logics push) in Queue consumers, not in the request path.
- Pulling a statement from Plaid and forwarding to Storage should stream (`response.body` into the upload), not buffer.
- Libraries: `supabase-js` works over fetch; `pdf-lib` is pure JS and workable; anything that needs `fs`, native bindings (`sharp`, `canvas`, `pdf-parse`'s fs reads, Ghostscript/poppler binaries) does not [MED, test]. The existing **Python** parser and `psycopg` engine cannot run in a Worker. Decide in P7: port the deterministic engine to TypeScript (strict, with the missing `test_determination.py` written first), or host it as a separate service behind the Worker. Do not hide this decision behind "the Worker will call Python".
- Teller needs mTLS client certs [HIGH]; use the Workers `mtls_certificates` binding (`wrangler mtls-certificate upload`), not a PEM in a 5 KB env var.
- Cron/queue consumers have their own duration limits (15 min), which matters for reconciliation loops.
- Keep `compatibility_date` pinned and tested; secrets via `wrangler secret put`, never in `[vars]` or committed config.
**Warning signs:** "Worker exceeded CPU/memory" in logs only for real phone photos; works under `wrangler dev` but not deployed; a PDF library failing at build for a Node-only import.
**Phase to address:** P1 (Paid plan, direct-to-Storage upload pattern, Queue + Cron skeleton, bundle smoke test of `pdf-lib` + `supabase-js`), P3, P7 (Python-vs-port decision).

---

## Moderate Pitfalls

### M1: Texting clients without a consent and opt-out system (TCPA and carrier rules)

**What goes wrong:** v1 has no own SMS provider (Out of Scope) but Plaid/Truv-sent texts and any future reminder feature still originate from the firm's workflow. Phone numbers in Logics may be stale or reassigned; "chase" cadences are automated messages.
**Specifics:** The FCC revocation rule is in force: consumers can revoke by any reasonable means and senders must honor it within 10 business days; the broader "revoke all" part has been delayed to January 31, 2027 [MED, secondary source]. Logics exposes `Case/StopSMS` (a write) but the documented case payload has no readable SMS-permission flag, so ResSpark cannot check Logics before sending [HIGH on doc]. State "mini-TCPA" laws and quiet-hour rules vary [VERIFY]. When a firm later adds its own SMS via A2P 10DLC, tax-debt-adjacent content can face stricter carrier vetting [LOW].
**Prevention:** On the staff "send" screen add a required checkbox "Client agreed on this call to receive a text at this number" and log it; keep a local suppression list, and call `Case/StopSMS` when the client opts out via any channel; no automated reminder texts in v1; the live-agent copy-link flow is lower risk than automated sends. Log the destination number and consent on each send. Decide on a consent script with ValorTax compliance.
**Phase:** P2 (consent checkbox, suppression), P8 (counsel review before any automated messaging).

### M2: E-mail deliverability and address validation

**What goes wrong:** Link e-mails land in spam ("it's in spam" is in the call), and typo'd addresses (`gmailcom`) send tax links to strangers. Vendor-sent e-mails come from vendor domains, and clients on the phone are primed for IRS-impersonation scams.
**Prevention:** Validate at send time: syntax, known-typo domain table (`gmailcom`, `gmial.com`, `hotmial.com`, `yaho.com`), and an MX lookup via DNS-over-HTTPS; require staff to confirm the address read back by the client. Send from a dedicated subdomain with SPF, DKIM, DMARC aligned; use a transactional provider; keep subject/body plain (no "tax debt" plus a bare button), name the agent and firm, include the agent's direct phone. Keep the copy-link button as the primary path. Warm up the sender domain before the first real batch.
**Phase:** P2 (validation), P8 (domain authentication and inbox test across Gmail/Outlook/Yahoo).

### M3: "Teller is a one-line config change" is false

**What goes wrong:** Provider abstraction is written to Plaid's shape, then Teller does not fit.
**Specifics [HIGH]:** Teller requires **mTLS** for all requests with end-user data in development and production, plus an access token as the basic-auth user; the Development environment connects to real banks but is limited to 100 enrollments, and production requires KYB. Teller's account sub-resources documented are `details`, `balances`, `transactions`; **no PDF statements endpoint is documented** [HIGH on the docs page; confirm with Teller]. Teller Connect is an embedded widget; there is no Plaid-style Hosted Link delivering over SMS. Enrollments and webhooks have their own event model.
**Prevention:** Define the interface by **capabilities** (`transactions`, `statements_pdf`, `account_identity`, `hosted_connect`) and have each provider declare which it supports; the UI and the "missing statements" flow (C6) key off capabilities. Keep provider data in provider-specific tables behind a normalized read model. Ship Teller only after Plaid works end to end, and list "no statement PDFs; client uploads or we export transactions" as an explicit trade in the cost decision.
**Phase:** P4 (interface design), P8 (Teller production KYB if chosen).

### M4: Plaid Transactions cost, sync timing, and Item health

**Prevention:** Initial and historical transaction pulls are asynchronous; wait for the `SYNC_UPDATES_AVAILABLE` flags indicating initial/historical completion rather than showing "0 transactions" to staff [MED, verify field names in sandbox]. Show "syncing" state. Handle `ITEM_LOGIN_REQUIRED` and consent expiry by showing "client must reconnect" with a re-send action; do not retry silently. Schedule `/item/remove` per C11. Encrypt and never log access tokens.
**Phase:** P4.

### M5: Truv multi-employer, coverage gaps, and order lifecycle

**What goes wrong:** The call explicitly flags two jobs, a 1099, and a job change two years ago, and says multi-login "I haven't really tested out yet" (12:35).
**Specifics [HIGH]:** Orders carry `expired_at`/`is_expired`, can be canceled, and webhooks arrive per product, link, and `employer_id`, so one order can produce several events; update is allowed only while employers are `pending` or `sent`. Bridge CSP must allow `my.truv.com` and `cdn.truv.com` (from PROJECT.md). Many small employers, gig platforms and 1099 work are not on supported payroll systems; real payroll logins often add MFA the sandbox never shows.
**Prevention:** In sandbox, test `multiple.employments` and a second connection in the same session before building the UI; model `payroll_connections` (many per request) and let staff add "another employer" as an additional order. Always show a "Can't find my employer → upload pay stubs / 1099 / bank deposits instead" path that feeds the same checklist. Handle expiry by showing "request expired, ask your agent to resend" and offering one-click resend. Use the `income` product only (Plaid already covers bank assets) to control cost. Truv sandbox success proves nothing about production login friction; plan a real-account pilot.
**Phase:** P5.

### M6: Logics field mapping and tenant specifics

**Prevention:** Map in one module with fixtures from real response shapes: `Find*` returns `Address/AptNo/City/State/Zip` and three phone fields; `Case/CaseInfo` adds `DOB`, `MaritalStatus`, `TaxLiability` (string) and `ServiceID1..6`; list responses may omit fields. Parse defensively, treat `""` and `null` as unknown (not zero; ties to M7). Preserve Logics `Language` (present in Find results) for client-portal language (M8). Keep base URL, `FileCategoryID`s, `ActivityType`, `StatusID` meanings, and branding in per-firm config (the white-label goal). Write nothing back to case demographic fields in v1.
**Phase:** P2.

### M7: Connected data enters `FinancialData` as 0, or as truth

**What goes wrong:** Extends CONCERNS (zero defaults). Bank and payroll feeds make this worse: a missing employer, an unsupported statement, or an account with no transactions can be mapped to `0.0`, and Plaid's inferred categories can be treated as 433-A line items.
**Prevention:** Ingestion adapters set `NULL` (unknown) unless the provider returned an explicit value; add a test where each provider returns partial data and the 433-A view shows "needs data", not a number. Treat transaction categories as hints that staff accept per line; the 433-A uses IRS allowable-expense standards plus documented actuals, and the form is signed under penalty of perjury. The pre-population view shows source, provider, and confirmation state per value.
**Phase:** P7 (adapters + view), with the CONCERNS fix landing in P1 or the start of P7.

### M8: Older clients on phones: in-app browsers, tap targets, timeouts, language

**Prevention:** Target WCAG 2.2 AA: touch targets at least 24x24 CSS px (aim 44-48), body text 16 px or larger (prevents iOS zoom on focus), contrast 4.5:1, visible focus, no drag-and-drop as the primary upload (use "Take photo / Choose file" first), one task per screen with a numbered step list that matches what the agent says on the phone ("Step 2 of 5: Connect payroll"), progress persisted so a reload resumes, no session timeout shorter than the task (WCAG 2.2.1: warn and extend). Test the real entry path: SMS opens in Safari, e-mail opens in Gmail/Outlook in-app browsers, which block pop-ups (a documented Plaid failure mode, see C5). Put a persistent `tel:` link to the firm at the top. Support Spanish (Logics `Language`; Plaid `language`; DocuSeal template variants) as a P8 decision. Treat vendor iframes (Plaid, Truv, DocuSeal) as outside your control and test them with VoiceOver and TalkBack, escalating issues to the vendors. shadcn/Radix primitives are accessible by default; custom dropzones and step components usually are not, so keyboard-test them.
**Phase:** P3 (design system rules), P8 (real-device and screen-reader audit with at least a few 65+ testers).

### M9: Smarty autocomplete key exposure and county mapping

**Prevention:** The Autocomplete Pro embedded key is public by design; restrict it by allowed hosts/referrers and monitor usage so scrapers cannot burn credits. Validate the final address server-side against Smarty's US Street API before storing; store county FIPS rather than a county name (the repo's `normalize_county_name` is a known lookup-mismatch risk in CONCERNS). Handle commercial/PO box/unincorporated results and let the client or agent override with an audit note.
**Phase:** P3.

### M10: Upload handling for real phones

**Prevention:** Accept `image/*` and PDF; handle HEIC explicitly (convert in the browser or reject with guidance); sniff magic bytes server-side rather than trusting extensions; cap pages and pixels (PDF/image bombs); reject password-protected PDFs with a human message; auto-downscale photos client-side before upload (also solves the 6 MB Logics cap, C9); per-file progress with retry; resumable via TUS for large files; virus scan is a [VERIFY] decision for P8. Render extracted text with `textContent`, never `innerHTML` (extends the CONCERNS finding for the redesigned UI).
**Phase:** P3.

### M11: DocuSeal deployment choices

**Prevention:** Cloud API is the fastest path for the demo; self-hosting is AGPL (fine to run, but copying its code into a closed product is not; same for `seziro-team/gather`, already noted in PROJECT.md). Embedding via `@docuseal/react` needs the Worker to create the submission and hand the client only its submitter slug; set CSP `frame-src` accordingly. One template per document type; test field placement on a phone. Keep `external_id` = ResSpark request id for idempotent mapping.
**Phase:** P6.

### M12: Live status that lies

**Prevention:** Supabase Realtime for the staff dashboard needs private channels/RLS or it leaks across firms; polling every 10-15 s is acceptable for the demo. Show `last_event_at` per request so staff can tell "waiting" from "stuck". Derive overall status from per-step statuses, never from a single webhook.
**Phase:** P2.

### M13: Single-firm shortcuts that make white-label a rewrite

**Prevention:** Even in v1: `firm_id` on every row, per-firm config table (Logics base URL and encrypted credentials, category IDs, branding, retention days, enabled providers), no firm names in code. Do **not** build tenant admin UI yet.
**Phase:** P1.

---

## Minor Pitfalls

- **Clock skew:** Plaid and DocuSeal reject signatures older than 5 minutes; use Worker `Date.now()` and log skew failures separately from signature failures.
- **Hono body consumption:** reading `c.req.json()` before verification destroys the raw body; use a middleware that captures the text once.
- **Phone formats:** Logics mixes `(121)121-2121` and bare digits; normalize in one function with tests.
- **Time zones:** Logics appointment endpoints use mm/dd/yyyy and abbreviations (PST/EST); do not reuse for audit timestamps; store UTC.
- **Env var limits:** 5 KB per Worker variable; do not put certificates or JSON key files in vars.
- **Smarty and Plaid keys in `VITE_*`:** only publishable/embedded keys may be there; add CI check.
- **Hardcoded demo mode:** keep a visible "SANDBOX" banner when providers run in sandbox so no one confuses it with production.
- **Trial limits:** Plaid Trial = 10 Production Items, not recoverable; plan pilot accounts.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Worker uses service-role key everywhere, no data-access module | Fastest to demo | Cross-case leak from one missing predicate (C3) | DEMO only with synthetic data; never with real data |
| Skip webhook signature verification "for now" | Saves an afternoon | Forged events; hard to retrofit across three vendors (C4) | Never past DEMO; verify helper is small, build it first |
| Store provider access tokens in plain columns | Simple | Token = bank-data bearer; breach blast radius (C10) | Sandbox tokens only |
| Receive uploads through the Worker | Simple code path | Memory/CPU crashes, 6 MB/size surprises (C14) | Never; signed direct upload is no harder |
| Plaid-delivered SMS as the send path | Less UI | Beta + fee + not testable in Sandbox (C5) | Only after Plaid enables and prices it |
| Single "provider" table shaped like Plaid | Fast | Teller/Truv do not fit (M3) | Never; capability interface is the same effort |
| Python engine called from the Worker "somehow" | Reuses 27 tests | No such runtime path (C14) | Never; decide port vs service in P7 |
| Hard-code ValorTax URLs/IDs | Faster | White-label rewrite (M13) | Never; config row costs minutes |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Plaid Link | Generate link at send time; trust redirect as success | Fresh token per tap; success only from `SESSION_FINISHED`/`/link/token/get` (C5) |
| Plaid Statements | `statements` in `products`; assume every bank | `required_if_supported_products`; manual-upload fallback (C6) |
| Plaid Transactions | Default `days_requested` (90) | Set 200-730 at link time; cannot change later (C6) |
| Plaid billing | Leave Items connected | `/item/remove` on retention schedule (C11) |
| Truv | One order = all employers; no replay | Multi-connection model; reconcile by polling (M5, C4) |
| Teller | Treat as Plaid clone | mTLS binding, capability interface, no statement PDFs (M3) |
| Logics | First search hit wins; blind retry on upload | Confirm card; ledger with `unknown` state (C8, C9) |
| DocuSeal | Store document URLs | Persist PDFs + audit log; store `submission_id` (C13) |
| Supabase | Open `anon` policies for the client link | Worker gateway, no anon policies, anon-zero-rows test (C3) |
| OpenRouter | Rely on model default routing | `zdr:true`, `data_collection:"deny"`, `allow_fallbacks:false`, redaction (C12) |
| Cloudflare | Free plan; buffer bodies | Paid plan; stream; direct-to-Storage (C14) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| 50-subrequest cap on Free | Random 5xx on statement batches | Workers Paid + Queue consumers | First case with 3+ accounts x 6 statements |
| Buffering uploads/statements in memory | "Worker exceeded memory" | Stream; signed direct upload | First 20+ MB batch, or ~10 concurrent uploads |
| Polling Plaid/Truv per page view | Rate-limit errors, slow dashboard | Webhook-driven state + 1 cron reconciler | ~50 open requests |
| Per-row `auth.uid()` in RLS and unindexed `firm_id`/`case_id` | Slow lists | `(select auth.uid())`, index policy columns | ~10k documents |
| Pushing documents to Logics in parallel | 500s, duplicates | Serial queue, `unknown` state | First multi-document push |
| Historical Plaid sync on 730 days | "No transactions" confusion | Syncing state, wait for completion webhook | Every new Item |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Token in URL logged or sent via Referer/analytics | Account takeover of the client session | Cookie exchange, no-referrer, analytics off on `/c/*` (C2) |
| Staff accounts without MFA | Safeguards violation; credential stuffing | Enforce TOTP; invite-only signup (C10) |
| Logging webhook payloads | PII in Workers Logs | Allowlist logger (C12) |
| Signed download URLs with long TTL | Link reuse after staff leaves | 60-300 s TTL; log issuance (C3) |
| Client-controlled `case_id` in API bodies | IDOR across cases | Derive from session only (C3) |
| Unverified webhook endpoints | Forged connected/signed events | Signature + replay window + dedupe (C4) |
| Same Logics key for read and write | Over-privilege | Separate keys; write key only in prod (C1, C9) |
| Provider tokens unencrypted at rest | Bank-data access if DB leaks | App-level encryption, key outside DB (C10) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Dead "expired" screens | Client calls the firm, agent babysits again | Long-lived portal link, fresh vendor links on tap, one-click resend (C5) |
| Desktop-first upload (drag-drop) | Older clients on phones cannot proceed | Camera/Files buttons first (M8, M10) |
| No "can't find my bank/employer" path | Dead end for credit unions and 1099 workers | Always-visible upload alternative (C6, M5) |
| Technical errors from vendors | Panic ("is this the IRS?") | Plain-language status, firm phone link, agent name (M8) |
| Wrong-client confirmation hidden | Embarrassing privacy incident | Mandatory confirm card (C8) |
| Staff status shows only "sent/done" | Chasing returns | Per-step status with last activity (M12) |

## "Looks Done But Isn't" Checklist

- [ ] **Webhooks:** Verified signature against a real vendor delivery, not a hand-built fixture; duplicate delivery is a no-op; a disabled endpoint recovers via the reconciler.
- [ ] **Bank link:** Works from SMS-in-Safari and from the Gmail in-app browser to Chase-style OAuth in Production (sandbox cannot show this).
- [ ] **Statements:** Every connected account has an explicit state (`available`, `not_supported`, `uploaded_manually`); no silent zero PDFs.
- [ ] **History:** Item shows 6+ months of transactions (check `days_requested` in the created link token).
- [ ] **Logics push:** Each pushed file has a stored `CaseDocumentID`; > 6 MB files are caught before push; `unknown` state exists.
- [ ] **Wrong-client:** Cannot send without the confirmation tap; contact differs from Logics requires an override.
- [ ] **RLS:** Anon role returns zero rows on every table; staff of firm A cannot read firm B; views are `security_invoker`; buckets private.
- [ ] **E-sign:** Signed PDF and audit PDF stored in Storage with hash; consent row exists; step-up check precedes the frame.
- [ ] **Retention:** A cron actually removed Plaid Items, Truv data and Storage objects for a closed test case.
- [ ] **Audit log:** Can answer "who viewed this statement and when" for any document.
- [ ] **LLM path:** Redaction on, ZDR params present in the outbound request, AI fields blocked until confirmed.
- [ ] **Accessibility:** Operated entire flow with one hand on a phone at 200% text size; VoiceOver completes steps 1-5.
- [ ] **Demo hygiene:** `LOGICS_WRITE_ENABLED` false; only test CaseIDs; SANDBOX banner visible.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong client received link (C8) | HIGH | Revoke token, audit-log trail, notify firm per its incident plan, check whether any connection was completed; if so `/item/remove` and purge |
| Token leaked/forwarded (C2) | MEDIUM | Revoke and reissue; review audit log for sessions; purge unsanctioned connections |
| Duplicate/misfiled Logics documents (C9) | MEDIUM | Ledger identifies batch via `Comment` UUIDs; ask Logics admin to delete (no API delete); add an Activity note explaining |
| Lost webhooks (C4) | LOW | Run reconciler for all in-progress requests; re-enable Truv endpoint in dashboard |
| RLS gap discovered (C3) | HIGH | Disable PostgREST exposure for the table, rotate service key and tokens, review access logs, assess FTC 30-day notification obligation with counsel |
| Plaid billing creep (C11) | LOW | List Items, `/item/remove` for closed cases, add the cron |
| Vendor access revoked/denied (C7) | HIGH | Fall back to manual upload path (already built); resubmit with consistent use-case statement; keep Teller as second source |
| Signed doc evidence expired (C13) | HIGH | Re-download from vendor if still available; otherwise re-sign; fix persistence before next signature |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| C1 Demo contamination | P1, DEMO | Write path rejects non-allowlisted CaseIDs; read-only key in DEMO |
| C2 Link-as-auth | P1, P3, P8 | Scanner GET does not mark opened; token absent from logs; pen test |
| C3 RLS / service role | P1 (+ every phase) | Anon-zero-rows test; advisor clean; cross-firm test |
| C4 Webhooks | P1, P4, P5, P6 | Real-delivery signature pass; duplicate no-op; reconciler heals a dropped event |
| C5 Plaid Link mode | P4, DEMO, P8 | Fresh link per tap; iOS Safari + Gmail in-app test; Chase approval in Production |
| C6 Statements/history | P4, P2, P8 | Config assertion on link token; pilot across 5 bank types |
| C7 Production access/use case | P1, P4, P5, P8 | Single use-of-data text reused; consent rows present; vendor written answers |
| C8 Logics ambiguity | P2 | Multi-result fixture requires confirm; send-time re-fetch |
| C9 Logics write safety | P2, P3, P8 | Ledger states; 6 MB gate; fake-Logics tests |
| C10 Safeguards/WISP | P1, P8 | MFA enforced; audit queries; evidence pack complete |
| C11 Retention/disposal | P1, P4, P5, P8 | Cron deletes a test case end to end; Plaid Item gone |
| C12 PII to LLM/logs | P1, P7, P8 | Log grep clean; ZDR params in outbound request; confirmation gate |
| C13 E-sign validity | P6, P8 | PDF + audit persisted with hash; consent row; counsel sign-off on scope |
| C14 Workers limits | P1, P3, P7 | Paid plan; 20 MB batch test; Python-vs-port decision recorded |
| M1 TCPA/opt-out | P2, P8 | Consent checkbox logged; suppression list; StopSMS wired |
| M2 E-mail deliverability | P2, P8 | Typo table test; SPF/DKIM/DMARC pass; inbox placement test |
| M3 Teller myth | P4, P8 | Capability interface in code; Teller adapter passes without statements |
| M4 Plaid sync/cost | P4 | "Syncing" state; reconnect flow |
| M5 Truv multi-employer | P5 | Sandbox `multiple.employments` test; expiry/resend flow |
| M6 Logics mapping | P2 | Fixture-driven mapper tests |
| M7 NULL vs 0 ingestion | P1/P7 | Partial-data tests show "needs data" |
| M8 Accessibility | P3, P8 | WCAG 2.2 AA checklist; real-device + screen reader audit |
| M9 Smarty | P3 | Host-restricted key; FIPS stored |
| M10 Uploads | P3 | HEIC, >6 MB photo, password PDF test cases |
| M11 DocuSeal | P6 | Phone signing test; CSP correct |
| M12 Live status | P2 | Private channels or polling; `last_event_at` visible |
| M13 Single-firm shortcuts | P1 | `firm_id` everywhere; config table exists |

## Phases that likely need deeper research or a spike before planning

- **P4:** Plaid production onboarding (Statements enablement, Chase early access, OAuth/security questionnaire, Link Delivery beta); 1-day spike with a real Plaid dashboard.
- **P5:** Truv multi-employer behavior and production login friction; sandbox spike.
- **P6:** ValorTax counsel/CPA decision on which forms are e-signed and by what consent text.
- **P7:** Python-vs-TypeScript decision for the determination engine; LLM redaction design.
- **P8:** 7216 applicability, state requirements for tax-resolution contracts, TCPA script, WISP evidence pack, pen test.
- **P1, P2, P3, P6 (mechanics):** standard patterns, no extra research needed beyond this file.

## Sources

- Plaid Hosted Link (Link Delivery beta/fee, URL lifetimes, `SESSION_FINISHED`, `/link/token/get` 6-hour window, sandbox delivery): https://plaid.com/docs/link/hosted-link/ [HIGH]
- Plaid Statements (coverage ~40%, depository only, Chase early access, billing at Item creation, `required_if_supported_products`): https://plaid.com/docs/statements/ [HIGH]
- Plaid Transactions (`days_requested` default 90, max 730, immutable once added): https://plaid.com/docs/transactions/ and https://plaid.com/docs/api/sandbox/ [HIGH]
- Plaid webhook verification (ES256 JWT, 5-minute `iat`, raw-body SHA-256, whitespace sensitivity): https://plaid.com/docs/api/webhooks/webhook-verification/ [HIGH]
- Plaid OAuth guide (HTTPS redirect, webview pop-up limits, Chase security questionnaire, PNC MSA): https://plaid.com/docs/link/oauth/ [HIGH]
- Plaid Sandbox differences (no e-mail/SMS, generic OAuth, http redirect allowed, Trial 10 Items): https://plaid.com/docs/sandbox/ , https://plaid.com/docs/account/billing/ [HIGH]
- Plaid billing (Transactions subscription until `/item/remove`): https://plaid.com/docs/account/billing/ [HIGH]
- Plaid Data Transparency Messaging (use cases, consent): https://plaid.com/docs/link/data-transparency-messaging-migration-guide/ [HIGH]
- Truv webhooks (`X-WEBHOOK-SIGN` HMAC-SHA256, 3 retries/30 s, endpoint disabled, no replay, `webhook_id` idempotency, IPs): https://docs.truv.com/api-reference/webhooks [HIGH]
- Truv orders (share_url, expiry, cancel, update constraints, per-employer webhook): https://docs.truv.com/api-reference/orders/object , https://docs.truv.com/developers/integration/embedded-orders/overview [HIGH]
- Truv MSA (FCRA permissible-purpose representation): https://truv.com/legal/msa [MED, snippet]
- Teller authentication/environments/accounts (mTLS, 100-enrollment dev limit, KYB, endpoints): https://teller.io/docs/api/authentication , https://teller.io/docs/guides/environments , https://teller.io/docs/api/accounts [HIGH]
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/ ; Node.js compat: https://developers.cloudflare.com/workers/runtime-apis/nodejs/ ; mTLS binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/ ; best practices (stream bodies): https://developers.cloudflare.com/workers/best-practices/workers-best-practices/ [HIGH]
- Supabase RLS (views, service key, `user_metadata`, anon `using(true)`, `(select auth.uid())`): https://supabase.com/docs/guides/database/postgres/row-level-security ; Storage limits: https://supabase.com/docs/guides/storage/uploads/file-limits , https://supabase.com/docs/guides/storage/uploads/standard-uploads [HIGH]
- 16 CFR 314.4 (MFA, encryption, logging, two-year disposal): https://ecfr.gov/current/title-16/chapter-I/subchapter-C/part-314/section-314.4 [HIGH]
- IRS Pub 4557, Pub 5708, and Aug 2026 WISP reminder (tax pros are financial institutions; 500+ consumers, 30 days): https://www.irs.gov/pub/irs-pdf/p4557.pdf , https://www.irs.gov/pub/irs-pdf/p5708.pdf , https://www.irs.gov/newsroom/irs-security-summit-remind-tax-pros-they-need-a-written-information-security-plan-to-protect-client-data [HIGH]
- 26 CFR 301.7216-2 / -3 (disclosure and consent for tax return information): https://ecfr.gov/current/title-26/chapter-I/subchapter-F/part-301/subpart-ECFRa197f7a9e2c9460/subject-group-ECFR32261461a26e430/section-301.7216-3 [HIGH on text; applicability VERIFY]
- IRS e-signature: Forms 2848/8821 online vs mail/fax: https://www.irs.gov/tax-professionals/submit-forms-2848-and-8821-online ; IRM 10.10.1 forms list: https://www.irs.gov/irm/part10/irm_10-010-001 [HIGH; recheck IRM before launch]
- DocuSeal webhooks and URL expiry: https://www.docuseal.com/resources/use-webhooks , https://www.docuseal.com/guides/download-signed-documents [HIGH]
- OpenRouter ZDR and provider routing: https://openrouter.ai/docs/guides/features/zdr , https://openrouter.ai/docs/guides/routing/provider-selection [HIGH]
- FCC TCPA revocation rule and delays: https://docs.fcc.gov/public/attachments/DA-25-312A1.pdf (to April 11, 2026) ; https://activeprospect.com/blog/tcpa-revocation-of-consent/ (to January 31, 2027) [MED]
- Logics Public API V4 documentation (repo): `Logics_API_Documentation.docx.md` (auth, scopes, 6 MB, Find array responses, StopSMS, no rate-limit or idempotency documentation) [HIGH]
- Call transcript (repo): `transcript.md` (wrong-case concern, 6-month decision, tax-preparation framing, PostHog mention, multi-employer untested, e-sign UX issues) [HIGH]

Not run: the `research-plan`/`research-store` caching seam and `classify-confidence` command were not used; confidence tags above are assigned by source type (official docs/regulation = HIGH).

---
*Pitfalls research for: tax-resolution client document collection (Plaid/Truv/Teller, Logics, Cloudflare Workers, Supabase)*
*Researched: 2026-10-10*
