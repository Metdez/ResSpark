# Phase 2 — API Coverage Decision Matrix

> Full coverage by default. Opt-outs are explicit, reasoned decisions. Produced by gsd-planner because `api-coverage.cjs` returned `detected: true` over the Phase 2 scope (signals: "integrates the IRS Logics read API", "Resend API"). Phase 2 integrates the Logics **read** surface for case lookup (D-02, D-03, D-05) and Resend's send endpoint (D-09). Logics stays the system of record (REQUIREMENTS "Out of Scope"); writes are Phase 5 behind `logicsWriteGuard`.

## IRS Logics Public API V4 (`https://valortax.logiqsapi.com/publicapi/V4/`, Basic auth, header parameters)

| capability | decision | reason |
|---|---|---|
| **Find** | | |
| `GET Find/FindCaseByPhone` (header `phone`) | INTEGRATE | Plan 02 `client.findByPhone`, Plan 03 lookup type `phone` (LOOK-01, LOOK-03, D-04 digits-first + `(###)###-####` retry) |
| `GET Find/FindCaseByEmail` (header `email`) | INTEGRATE | Plan 02 `client.findByEmail`, Plan 03 lookup type `email`; also the "Test connection" probe with the admin's email (D-03) |
| `GET Find/FindCase` (headers `lastName`, `phone`) | INTEGRATE | Plan 02 `client.findByLastNameAndPhone`, Plan 03/05 optional `Last name (optional)` narrowing on phone searches (LOOK-02 disambiguation) |
| **Case** | | |
| `GET Case/CaseInfo` (header `CaseID`) | INTEGRATE | Plan 02 `client.caseInfo`; Plan 03 confirm re-fetch; Plan 04 send-time re-fetch (LOOK-04, C8) |
| `GET Case/CaseInfo` `details` header (officer/attorney ids) | OPT-OUT | not needed — staff assignment ids are not shown or stored in v1 |
| `POST Case/CreateCase` | OPT-OUT | Logics stays the system of record; ResSpark never creates cases (REQUIREMENTS Out of Scope) |
| `POST Case/UpdateCase` | OPT-OUT | write; M6 "write nothing back to case demographic fields in v1" |
| `GET Case/GetCasesByStatus` | OPT-OUT | not needed — lookup is by identity, not status; polling by status is v2 (PLATV2-02) |
| `POST Case/StopSMSPermission` | OPT-OUT | Phase 8 — suppression/opt-out handling after counsel review (M1); no SMS is sent in v1 |
| `GET Case/GetCaseStatusInformation` | OPT-OUT | not needed yet — cards show the raw `StatusID`; a per-firm status-name mapping is a later config item (C8, M6) |
| **Case Activity** | | |
| `GET Activity/Get` | OPT-OUT | Phase 5 — activity notes accompany document pushes (PUSH-03) |
| `POST Activity/Create` | OPT-OUT | Phase 5 (PUSH-03); write behind `logicsWriteGuard`; needs `ActivityType` from Andrew |
| `POST Activity/Update` | OPT-OUT | Phase 5 or never — notes are append-only from ResSpark |
| **Documents** | | |
| `POST Documents/CreateCaseDocument` | OPT-OUT | Phase 5 (PUSH-01); write behind `logicsWriteGuard`; needs `FileCategoryID` from Andrew |
| **Fax** | | |
| `POST Fax/SendFax` | OPT-OUT | not needed — no fax workflow in ResSpark |
| **Report** | | |
| `POST Report/GetActivityReport` | OPT-OUT | not needed — ResSpark keeps its own `events` timeline (STAT-04, Phase 3) |
| **Services** | | |
| `GET Services/GetServiceDetails` | OPT-OUT | not needed yet — `ServiceID1..6` are not interpreted in v1; candidate for the 433-A view (Phase 7) |
| **Task** | | |
| `GET Task/Get`, `POST Task/Create`, `GET Task/ListByDateRange` | OPT-OUT | not needed — ResSpark does not manage Logics tasks or calendar events |
| **Appointment** | | |
| `GET Appointment/GetAvailableSlots`, `POST Appointment/Book`, `POST Appointment/Update`, `GET Appointment/GetSettlementOfficerEmail` | OPT-OUT | not needed — scheduling stays in Logics; out of ResSpark's document-collection scope |
| **Billing** | | |
| `GET/POST Billing/*` (CaseAccount, CasePayment, CaseInvoice, CaseAmortization, BillingSummary) | OPT-OUT | not needed — ResSpark never reads or writes firm billing; Bigcapital-style financial UI is a visual reference only |
| **User** | | |
| `POST User/Disable` | OPT-OUT | not needed — Logics user administration is the firm's, not ResSpark's |
| **Platform behaviors** | | |
| Basic auth header `Authorization: Basic base64(apiKey:secretToken)` | INTEGRATE | Plan 02 `createLogicsClient`; credentials from `firm_integrations` (AES-GCM, D-01) |
| 401/403 handling (bad auth / missing `case.read` scope) | INTEGRATE | Plan 02 `LogicsError` kinds → Plan 03 `logics_unauthorized`; "Test connection" treats them as credentials rejected (D-03) |
| Retry policy | INTEGRATE (reads only, once, network errors only) | orchestrator rule; writes are never retried (C9, Phase 5) |
| Non-ValorTax tenant base URL | INTEGRATE (editable `base_url`) | D-02 per-firm base URL, guarded by `validateLogicsBaseUrl` (https only, host pinned in production) |

## Resend (`https://api.resend.com`)

| capability | decision | reason |
|---|---|---|
| `POST /emails` (send one email) | INTEGRATE | Plan 04 `sendLinkEmail` (REQ-04, D-09); best-effort; `RESEND_API_KEY` optional |
| `POST /emails/batch` | OPT-OUT | not needed — one link email per request, sent on a staff click |
| `GET /emails/:id`, `PATCH /emails/:id` (reschedule), `POST /emails/:id/cancel` | OPT-OUT | not needed yet — delivery result is the synchronous send response; delivery-status webhooks are Phase 8 deliverability work (M2) |
| Attachments, `scheduled_at`, tags, `reply_to`, `cc`/`bcc` | OPT-OUT | not needed — plain link email only; no attachments (documents never leave the platform by email) |
| Domains API (`/domains`) | OPT-OUT | domain verification is a one-time dashboard action (USER ACTION); not automated in v1 |
| API Keys API (`/api-keys`) | OPT-OUT | the key is provisioned by the user via `wrangler secret put`; never managed from the Worker |
| Audiences / Contacts / Broadcasts | OPT-OUT | explicitly out of scope — no marketing or bulk email; clients are not a mailing list |
| Webhooks (`email.delivered`, `email.bounced`, …) | OPT-OUT | Phase 8 (REM-01 reminders + deliverability); Phase 4 builds the generic `/webhooks/:provider` route first |

## Not an integration surface (recorded for completeness)

| capability | decision | reason |
|---|---|---|
| SMS / text sending (any provider) | OPT-OUT | REQUIREMENTS Out of Scope: no own SMS in v1; "send by text" is a copy action; consent is recorded only (REQ-04, REQ-05, M1) |
| MX / DNS-over-HTTPS email validation | OPT-OUT | not needed yet — typo-domain table + syntax in Phase 2 (REQ-02 planner assumption); deliverability hardening is Phase 8 (M2) |
