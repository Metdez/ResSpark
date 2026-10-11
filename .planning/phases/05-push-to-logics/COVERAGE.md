# Phase 5 — API Coverage Decision Matrix

> Full coverage by default. Opt-outs are explicit, reasoned decisions. Produced by gsd-planner because the Phase 5 plan bodies integrate the IRS Logics **write** API (`Documents/CaseDocument` create, `CaseActivity/Activity` create) and read `CaseActivity/Activity` for configuration. Phase 2's `COVERAGE.md` owns the Find/CaseInfo read surface; those rows are repeated here only as cross-references. Logics stays the system of record (REQUIREMENTS "Out of Scope"); the ledger is a delivery log.

## IRS Logics Public API V4 (`https://valortax.logiqsapi.com/publicapi/V4/`, Basic auth)

| capability | decision | reason |
|---|---|---|
| **Documents** | | |
| `POST Documents/CaseDocument` (multipart `CaseID`, `Comment`, `FileCategoryID?`, `File`; 6 MB/file) | INTEGRATE | Plan 01 `createCaseDocument` (Task 2 live, Task 1 fake); consumer `jobs/logics-push.ts`; ≤ 5,767,168-byte parts only (Plan 02/03); outcome → ledger `sent|failed|unknown` (PUSH-01, PUSH-02, PUSH-04, D-03, D-05, D-07) |
| **Case Activity** | | |
| `POST CaseActivity/Activity` (JSON `CaseID`, `ActivityType`, `Subject`, `Comment`, `Popup`, `Pin`) | INTEGRATE | Plan 01 `createActivity`; one note per batch via `logics_push_finalize_batch` exactly-once flip (PUSH-03, D-07) |
| `GET CaseActivity/Activity` (header `CaseID`) | INTEGRATE (config only) | Plan 01 `listActivities` → Plan 03 Test connection stores distinct `ActivityType` strings in `settings.activity_types_seen` so staff pick a valid value (D-08); never used for reconciliation (no document data is returned) |
| `POST CaseActivity/Activity` update (`Update an Activity`) | OPT-OUT | notes are append-only from ResSpark; a failed note is recorded on the batch, never edited in Logics (M6, prohibition "no writes beyond create") |
| **Find** | | |
| `GET Find/FindCaseByPhone`, `Find/FindCaseByEmail`, `Find/FindCase` | OPT-OUT (Phase 2) | lookup surface owned by Phase 2 `COVERAGE.md`; Phase 5 reads `cases.logics_case_id` from the Phase 2 row, never the body (C8) |
| **Case** | | |
| `GET Case/CaseInfo` | OPT-OUT (Phase 2) | Phase 2 send-time re-fetch; Phase 5 does not re-read the case — the CaseID is already confirmed and stored |
| `POST Case/CreateCase`, `POST Case/UpdateCase` | OPT-OUT | Logics stays the system of record; ResSpark never creates or edits cases (REQUIREMENTS Out of Scope, M6) |
| `GET Case/GetCasesByStatus`, `GET Case/GetCaseStatusInformation` | OPT-OUT | not needed — push targets a confirmed case; status polling is v2 (PLATV2-02) |
| `POST Case/StopSMSPermission` | OPT-OUT | no SMS is sent in v1; opt-out handling is Phase 8 (M1) |
| **Fax** | | |
| `POST Fax/SendFax` | OPT-OUT | no fax workflow; documents go to the case file, not to a fax queue |
| **Billing** | | |
| `GET/POST Billing/*` (CaseAccount, CasePayment, CaseInvoice, CaseAmortization, BillingSummary) | OPT-OUT | ResSpark never reads or writes firm billing; never calls card/CVV endpoints (C9) |
| **Appointment** | | |
| `GET Appointment/GetAvailableSlots`, `POST Appointment/Book`, `POST Appointment/Update`, `GET Appointment/GetSettlementOfficerEmail` | OPT-OUT | scheduling stays in Logics; outside document collection |
| **Task** | | |
| `GET Task/Get`, `POST Task/Create`, `GET Task/ListByDateRange` | OPT-OUT | ResSpark does not manage Logics tasks; a "documents arrived" signal is the activity note, not a task |
| **Report** | | |
| `POST Report/GetActivityReport` | OPT-OUT | the ledger + `events` timeline is ResSpark's own record; Logics exposes no document list, so no reconciliation read exists (CONTEXT Deferred Ideas) |
| **Services** | | |
| `GET Services/GetServiceDetails` | OPT-OUT | candidate for the 433-A view (Phase 7); irrelevant to pushing documents |
| **User** | | |
| `POST User/Disable` | OPT-OUT | Logics user administration is the firm's, not ResSpark's |
| **Platform behaviors** | | |
| Basic auth `Authorization: Basic base64(apiKey:secretToken)` | INTEGRATE | reused from Phase 2 `createLogicsClient`; credentials decrypted per job via `liveClientFromRow`, never cached or logged (D-07, Phase 1 D-20) |
| 401 / 403 handling (bad auth / missing `case.write` or `activity.write`) | INTEGRATE | `logics_auth` / `logics_scope` → ledger `failed`; batch continues to finalize; staff `resend` after credentials are fixed (C9) |
| 500 / timeout / network error / unparsable 2xx | INTEGRATE | → ledger `unknown` (`logics_5xx`, `logics_no_response`, `logics_unparsed_200`); staff decision only, never automatic retry (PUSH-04, D-03) |
| Undocumented 4xx (e.g. 413 for oversize) | INTEGRATE (defensively) | `logics_rejected_<status>` → `failed`; unreachable for size because the 5,767,168-byte gate runs before dispatch (A1) |
| Retry policy for writes | OPT-OUT (deliberate) | writes are never retried automatically; only a refused ledger claim retries the queue message, and nothing has been dispatched at that point (PUSH-04, D-02, D-03) |
| Idempotency key | OPT-OUT (unavailable) | Logics offers none; ResSpark's `request_fingerprint` partial unique index is the client-side substitute (D-01) |
| Document list / get / delete | OPT-OUT (unavailable) | no such endpoints exist; `unknown` is a first-class ledger state for this reason (CONTEXT Deferred Ideas) |
| `FileCategoryID` lookup | OPT-OUT (unavailable) | no endpoint; value comes from Andrew into `firm_integrations.settings.file_category_id`; omitted from the request when unset, never `0` (D-08, Pitfall 5) |
| `ActivityType` enumeration | INTEGRATE (via GET listing) | see `GET CaseActivity/Activity` row; default `General` (the only value observed in the vendor doc) (A2) |
| Sandbox tenant | OPT-OUT (unavailable) | none exists; `LOGICS_MODE=fake` + `createFakeLogicsClient` cover the demo and tests (D-10) |

## Not an integration surface (recorded for completeness)

| capability | decision | reason |
|---|---|---|
| Cloudflare Queues (`resspark-jobs`, DLQ) | INTEGRATE (platform) | Phase 1/4 bindings reused; `logics_push` job type; `max_batch_size: 1`; ack-after-dispatch |
| Supabase Storage (`case-documents` bucket, `logics/` prefix) | INTEGRATE (platform) | Phase 3 bucket reused for normalized parts (D-06) |
| `@cantoo/pdf-lib` | INTEGRATE (library) | the only new package; `unpdf` deliberately not installed (Plan 02) |
