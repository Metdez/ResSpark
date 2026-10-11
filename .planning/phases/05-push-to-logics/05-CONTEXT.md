# Phase 5: Push to Logics - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 lets staff push approved documents (uploads, statements, pay stubs, W-2s, later signed PDFs) into the client's IRS Logics case with one click, safely: a ledger with queued/sending/sent/failed/unknown states and a staff resolution UI for `unknown`; PDF normalization that never sends anything over 6 MB; one activity note per batch; serialized pushes per case; and demo safety through `LOGICS_MODE=fake` plus the Phase 1 write guard. Requirements: PUSH-01..04.

</domain>

<decisions>
## Implementation Decisions

Discussion ran in `--auto` mode. Decisions follow `05-RESEARCH.md` (Logics contract HIGH from the vendor doc; live behavior MEDIUM because Logics has no sandbox). Override here before planning if needed.

### Ledger and serialization
- **D-01:** Table `logics_pushes (id, firm_id, case_id, document_id, part_index, part_count, state in queued|sending|sent|failed|unknown, mode in fake|live, logics_document_id, request_fingerprint, error_code, error_detail, attempts, claimed_at, sent_at, created_at, updated_at, created_by)` with a partial unique index on `request_fingerprint` for live states (queued/sending/sent) so the same document part is never pushed twice; `request_fingerprint` = sha256(case_id, document sha256, part_index). Migration `0006_logics_push.sql`, RLS on, grants revoked.
- **D-02:** Per-case serialization is a state-guarded claim RPC `logics_push_claim(push_id)` that moves `queued → sending` only when no sibling row for the same case is `sending`; the queue consumer calls it first and `retry({ delaySeconds: 30 })` if the claim is refused (nothing was sent). Cloudflare Queues ordering is best-effort and advisory locks cannot span the HTTP call, so the claim lives in the ledger (research finding).
- **D-03:** Ack-after-dispatch: once `fetch` to Logics is awaited, the message is always acked and the outcome lives in the ledger: HTTP 200 with `data.CaseDocumentID` → `sent`; 401/403 → `failed` (`auth`) and the whole batch stops; other 4xx → `failed`; 5xx, timeout, network error, or an unparsable 2xx → `unknown` (PUSH-04). A cron sweeper moves `sending` rows older than 10 minutes to `unknown`.
- **D-04:** The staff resolution UI for `unknown` shows the file, the attempt time, and two actions: "I checked Logics — it's there" (marks `sent`, records the staff id) and "Re-send" (creates a NEW ledger row with the same fingerprint only after the old one is marked `failed`); never an automatic retry of a multipart POST.

### Normalization (PUSH-02)
- **D-05:** `normalizeForLogics(document)` runs in the queue consumer: size gate at 5,767,168 bytes (5.5 MiB); PDFs over the gate are split with `@cantoo/pdf-lib@2.11.1` by greedy page accumulation (keep the last good `save()` under the gate, start a new part on overshoot), naming parts `{name} (part N of M).pdf`; JPEG/PNG images are wrapped into a single-page PDF with `embedJpg`/`embedPng`; a single page over the gate, an encrypted PDF without an empty password, HEIC (no decoder on Workers; Phase 3 converts client-side), or an unparsable file → `failed` with `error_code = needs_manual_compression` and a staff note. `unpdf` is not needed here.
- **D-06:** Parts are stored back into the bucket under `.../logics/{document_id}/part-{n}.pdf` with their own sha256 so a re-send uses identical bytes.

### Logics client and notes (PUSH-01, PUSH-03)
- **D-07:** `LogicsClient` (Phase 2's fetch client) gains `createCaseDocument({ caseId, file, fileName, comment, fileCategoryId? })` using multipart `FormData` with fields `CaseID`, `Comment`, `FileCategoryID` (omitted unless the firm configured one), `File`; Basic auth from the firm's stored credentials; the comment is `"Uploaded via ResSpark by {agent display name} — {original file name} ({part n of m when split})"`. `createActivity({ caseId, activityType, subject, comment })` posts `CaseActivity/Activity` with `ActivityType` from firm config (default `General`, the only value observed in the vendor doc), `Subject` = `"Documents uploaded via ResSpark"`, `Comment` listing the files in the batch; one activity per push batch, written after the last part of the batch resolves (sent or failed), never per file.
- **D-08:** Firm config (`firm_integrations.settings jsonb`) holds `file_category_id`, `activity_type`, and `write_enabled`; Phase 2's "Test connection" additionally lists the distinct `ActivityType` strings from `GET CaseActivity/Activity` so staff can pick a valid one. Andrew's answers on scopes/`FileCategoryID`/`ActivityType` remain a USER ACTION item.
- **D-09:** Staff UI: on the request/case page, approved items get a "Push to Logics" multi-select action; a confirmation sheet shows the files, sizes, the parts that will be created, anything that will be `needs_manual_compression`, and the activity note preview; the ledger renders inline per document with state chips and a "Simulated" badge in fake mode.

### Demo safety
- **D-10:** `LOGICS_MODE=fake` (default) swaps in a `FakeLogicsClient` that returns synthetic `CaseDocumentID`s and `ActivityID`s after a short delay; ledger rows are stamped `mode='fake'`; the admin banner reads "SANDBOX · Logics writes simulated". In `live` mode the Phase 1 `logicsWriteGuard` (flag + test-CaseID allowlist) runs in both the route and the consumer. Switching to `live` is a deliberate `wrangler.jsonc` var change after Test connection succeeds and Andrew confirms the write scopes.

### Claude's Discretion
- Exact backoff for the claim retry, the ledger table layout in the UI, part-naming details, and consumer CPU tuning (`limits.cpu_ms` stays default unless tests show a need).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/phases/05-push-to-logics/05-RESEARCH.md` — Logics contract (doc lines 943-974, 874-905, 71), claim RPC and ack-after-dispatch design, normalization algorithm, fake mode, Validation Architecture (generated PDF fixtures, fake Logics server, ledger state-machine tests)
- `Logics_API_Documentation.docx.md` — `Documents/CaseDocument`, `CaseActivity/Activity`, auth guide
- `.planning/research/PITFALLS.md` — C1 (demo contamination), C8, C9 (Logics writes), C14 (Workers limits)
- `.planning/phases/01-foundation-staff-sign-in/01-CONTEXT.md` — `logicsWriteGuard`, demo flags, Queue + cron bindings
- `.planning/phases/02-find-the-client-send-the-link/02-CONTEXT.md` — `firm_integrations`, Logics fetch client, `LOGICS_MODE=fake`
- `.planning/phases/03-uploads-review-live-status/03-CONTEXT.md` — `documents` rows, approval status, bucket helpers
- `.planning/phases/04-connect-payroll-bank/04-CONTEXT.md` — webhook/queue framework the consumer extends; connection documents are pushable
- `.planning/PROJECT.md` — Andrew: "uploaded by ResSpark, last ran by {agent}"
- `CLAUDE.md`, `.claude/CLAUDE.md`, `.agents/skills/supabase/SKILL.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phases 1–4: `logicsWriteGuard`, `LogicsClient` fetch wrapper and fixtures, queue consumer and DLQ, `documents` + bucket helpers, review panel, status badges, `logEvent`.
- `examples/` PDFs are 2–3 KB; splitter tests must generate larger fixtures (research Wave 0 note).

### Established Patterns
- RPC-with-event writes; ledgered external writes; fake mode for demos; companion docs; 500-line limit.

### Integration Points
- `app/worker/src/integrations/logics/` (client, fake client, normalize), `app/worker/src/jobs/` (consumer handler for `logics_push`), `supabase/migrations/0006_logics_push.sql`, `app/src/features/review/*` (push action, ledger, resolution UI), `wrangler.jsonc` (`LOGICS_MODE`).

</code_context>

<specifics>
## Specific Ideas

- Demo slice: push one small PDF to a test CaseID (fake mode unless Andrew supplies a write key and test cases), show the ledger row flip to `sent` and the activity note preview.
- Only one new package in this phase: `@cantoo/pdf-lib@2.11.1` (MIT, verified on npm 2026-10-10).

</specifics>

<deferred>
## Deferred Ideas

- Reading Logics documents or activities back for reconciliation (no endpoints exist); pushing the 433-A worksheet (Phase 7 uses this same path); a container-based compressor for oversized scanned pages (only if real uploads show the problem).

</deferred>

---

*Phase: 05-push-to-logics*
*Context gathered: 2026-10-10*
