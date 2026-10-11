# Phase 5: Push to Logics - Research

**Researched:** 2026-10-10
**Domain:** Ledgered multipart document push into IRS Logics (`Documents/CaseDocument`, `CaseActivity/Activity`) from a Cloudflare Queue consumer, with PDF normalization (`@cantoo/pdf-lib`) and demo-safety gating
**Confidence:** MEDIUM overall. The Logics contract (field names, auth, response shape, scopes) is HIGH because it is read from the repo copy of the vendor doc. Everything about *live* Logics behaviour (over-limit response, `ActivityType` strings, `FileCategoryID` values, rate limits, duplicate handling) is MEDIUM at best: Logics has no sandbox, no credentials exist in the repo, and the doc documents only 200/401/403/500. PDF and Workers mechanics are MEDIUM (Context7 docs) with one LOW web item (HEIC on iOS).

Provenance legend: `[VERIFIED: …]` tool-confirmed from an authoritative source or a local probe this session; `[CITED: …]` read in official docs this session; `[ASSUMED]` training knowledge or web-only, not verified.

No CONTEXT.md exists for this phase (`.planning/phases/05-push-to-logics/` was created by this research). The constraints below are inherited from Phase 1's locked decisions, REQUIREMENTS.md, ROADMAP.md and PITFALLS.md and are treated with the same authority.

<user_constraints>
## User Constraints (inherited — no 05-CONTEXT.md exists)

### Locked Decisions (from Phase 1 CONTEXT.md, ROADMAP.md Phase 5 scope notes, PITFALLS C1/C8/C9/C14)
- **D-01/D-06 (Phase 1):** One Vite project `app/` with `app/src/` (SPA) and `app/worker/` (Hono API, queue consumer, cron); Worker `resspark` on **Workers Paid** (confirmed via the subscriptions API, 2026-10-10 update in 01-CONTEXT.md); queue `resspark-jobs` with DLQ `resspark-jobs-dlq`; `compatibility_flags: ["nodejs_compat"]`.
- **D-07:** Secrets only as Worker secrets (`wrangler secret put`), local `.dev.vars`; never printed.
- **D-11:** `logics_pushes` is a later-phase additive migration in `supabase/migrations/NNNN_<name>.sql`; `events` + `log_event()` is the audit path; mutations that must be atomic with their event go through plpgsql RPCs.
- **D-12/D-15:** Worker is the only data path (secret key, one data-access module, every query scoped by `firm_id`); no PostgREST from the SPA.
- **D-19:** Worker vars `APP_ENV`, `LOGICS_WRITE_ENABLED` (default `false`), `LOGICS_TEST_CASE_IDS`; `logicsWriteGuard(env, caseId)` in `app/worker/src/integrations/logics/` throws unless the flag is on and the id is allowlisted. SANDBOX banner whenever `APP_ENV !== "production"`.
- **D-20:** Allowlisted JSON logger; never bodies, headers, tokens, document bytes.
- **D-21:** Vitest 5 `projects` (`web` jsdom, `worker` with `@cloudflare/vitest-plugin` 1.4.0); pure functions tested without the Workers runtime.
- **ROADMAP Phase 5 scope notes:** local ledger because Logics cannot list documents; serial, low-concurrency pushes; `FileCategoryID` and `ActivityType` from a config table; PDF work (`@cantoo/pdf-lib`, `unpdf`) in the Queue consumer; until Andrew confirms write scopes, push is exercised against a fake behind the allowlist.
- **Demo Cut:** one small PDF pushed to a test CaseID with an activity note and a visible ledger row, behind `LOGICS_WRITE_ENABLED` and the allowlist; if write scopes are unconfirmed by demo day, run against a recorded fake and say so.
- **PITFALLS C9:** never auto-retry the multipart POST; `unknown` on timeout/5xx; one document in flight per case; 6 MB gate before the click; document UUID in `Comment`; one summary Activity per batch; never call card/CVV endpoints.
- **PROJECT.md (Andrew's words):** push comment "uploaded by ResSpark, last ran by {agent}"; Logics integrations are "super weird", expect quirks.
- **CLAUDE.md:** TypeScript front end; no code file over 500 lines; companion Markdown in `docs/` per code file; Ponytail; copy code only from MIT/Apache repos.

### Claude's Discretion
- Exact column names beyond the ones listed in the phase description, the shape of the batch table, RPC names, queue message envelope fields, UI copy for the `unknown` resolution dialog, file-part naming, `Comment` text beyond Andrew's wording.

### Deferred Ideas (OUT OF SCOPE)
- Container-based PDF compression (qpdf/Ghostscript) — only if real uploads show many oversized single pages (STACK.md §4, SUMMARY "Gaps").
- Logics polling to auto-create requests (PLATV2-02); Logics document listing (no endpoint exists).
- Virus scanning before push (PLATV2-04).
- Writing any Logics case demographic field (M6: nothing written back in v1).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PUSH-01 | Staff select approved items and push them as Case Documents with a comment and a configurable `FileCategoryID`; local ledger records queued/sending/sent/failed/unknown per file | Q1 (multipart contract, auth, response parsing), Q4 (ledger schema + state machine + claim RPC), Q6 (credentials), Code Examples 1–4, Validation (client + state tests) |
| PUSH-02 | Files over 6 MB are normalized (images → PDF, PDFs split to ≤ 5.5 MiB parts) or flagged "needs manual compression"; nothing over 6 MB is ever sent | Q3 (`normalizeForLogics`: greedy splitter with last-good-bytes, image embed, encrypted/HEIC handling), size-gate constant `5_767_168`, Code Example 5, Validation (splitter tests with generated fixtures) |
| PUSH-03 | One activity note per push batch naming the agent and documents | Q2 (`CaseActivity/Activity` fields, `ActivityType` config with `General` default, test-connection GET), batch finalize RPC, Code Example 6 |
| PUSH-04 | Pushes never blindly retried; `unknown` needs a staff decision; Logics never receives duplicates | Q4 (`unknown` semantics, resolution UI, `request_fingerprint` duplicate guard, no `msg.retry()` after the POST is sent, stale-`sending` sweeper), Pitfall 1–3 |
</phase_requirements>

## Summary

Phase 5 is a small amount of code wrapped in a lot of discipline. The Logics write surface is two endpoints read verbatim from the vendor doc: `POST /publicapi/V4/Documents/CaseDocument` (multipart: `CaseID`, `Comment`, `FileCategoryID`, `File`; 6 MB per file; returns `{ Success, data: { CaseDocumentID } }`) and `POST /publicapi/V4/CaseActivity/Activity` (JSON: `CaseID`, `ActivityType`, `Subject`, `Comment`, `Popup`, `Pin`; returns `{ data: { ActivityID } }`), both under HTTP Basic `base64(apiKey:secretToken)`. Nothing can be read back: there is no list, get or delete for documents, so the local `logics_pushes` ledger is the only record, and a POST whose outcome we did not observe (timeout, network error, 5xx, or a 200 without a `CaseDocumentID`) must land in `unknown` and wait for a human, never in a retry loop.

Two platform facts shape the design. First, Cloudflare Queues deliver at-least-once with best-effort ordering and `max_concurrency` is a global consumer setting, not a per-key one, so per-case serialization cannot come from the queue; it comes from the ledger itself via an atomic claim RPC (`queued → sending` only when no other row for that case is `sending`), with a cron sweeper that moves stale `sending` rows to `unknown`. Second, Workers have a 128 MB isolate limit and 30 s default CPU (raisable to 5 min on Paid), so `normalizeForLogics` runs in the queue consumer with `max_batch_size: 1`, loads one source document at a time, and uses a greedy page splitter that keeps the last good save and starts a new part when the next page would cross `5_767_168` bytes (5.5 MiB, which is below both readings of "6 MB"). A single page over the limit, an encrypted PDF we cannot open, or a HEIC that reached the Worker becomes `needs_manual_compression`; nothing over the gate is ever posted.

For the Oct 12 demo, `LOGICS_MODE=fake` swaps the HTTP client for an in-process fake that returns synthetic ids and marks ledger rows `mode='fake'`, so the entire push flow (guard, normalization, ledger, activity note, UI) runs end to end without credentials, and the UI labels it "Simulated — Logics write not sent". The real client is exercised exactly once by hand against a test CaseID when Andrew supplies a write-scoped key.

**Primary recommendation:** Build `app/worker/src/integrations/logics/` as a ~60-line typed `fetch` client plus a fake, a `normalizeForLogics` module with a parameterized `targetBytes`, a `logics_push_batches` + `logics_pushes` migration with claim/transition/finalize RPCs, and one queue job `logics.push_part`; wire the SPA "Push to Logics" sheet to `/api/admin/cases/:id/logics-push` and the ledger panel to `/api/admin/cases/:id/logics-pushes`. Default `LOGICS_MODE=fake` until write scopes are confirmed.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Select approved items, set comment, click Push | Browser / Client (SPA `/admin/cases/:id`) | API (validates, creates batch) | UI only; the Worker decides what is pushable (approved, size-gated) |
| Create batch + ledger rows atomically with `events` | Database (plpgsql RPC `logics_push_create_batch`) | API (calls it) | D-11: mutation and audit row commit together |
| Demo-safety enforcement (`logicsWriteGuard`, mode) | API / Backend (Worker, both the route and the consumer) | Browser (banner + "Simulated" badge are display only) | Enforcement must be server-side (D-19) and re-checked in the consumer because flags can change between enqueue and send |
| Normalize (image → PDF, split, size gate) | API / Backend (Queue consumer) | Database / Storage (reads source object, writes part objects) | CPU/memory-bound; never in the request path (C14) |
| Multipart POST to Logics, response parsing | API / Backend (Queue consumer, `LogicsClient`) | — | Only the Worker holds decrypted credentials (D-07, PLAT-03) |
| Per-case serialization | Database (claim RPC on `logics_pushes`) | Queue (`max_concurrency` stays at the Phase 1 value) | Queues have no per-key ordering; the ledger row is the lock |
| `unknown` resolution (mark sent / re-send / discard) | Browser (dialog) → API (transition RPC) | Database (state check in `WHERE`) | Human decision recorded as an `events` row |
| Activity note per batch | API / Backend (consumer, after last part is terminal) | Database (`finalize` RPC claims the note exactly once) | Exactly-once via state flip, not via queue semantics |
| `FileCategoryID` / `ActivityType` config | Database (`firms.settings` jsonb or `logics_file_categories` table) | Browser (Settings page edits via Worker) | Per-firm, never in code (M13) |
| Credentials | Database (`firm_integrations`, AES-GCM ciphertext, Phase 2) + Worker secret (key) | API (decrypts per job) | LOOK-05; this phase only reads |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@cantoo/pdf-lib` | 2.11.1, published 2026-09-15, MIT, repo cantoo-scribe/pdf-lib `[VERIFIED: npm registry + Context7 /cantoo-scribe/pdf-lib]` | `PDFDocument.load/create`, `copyPages`, `embedJpg/embedPng`, `save`, `ignoreEncryption`/`password` | Maintained fork of `pdf-lib` (original last published 2022-05-12 `[VERIFIED: npm registry]`); pure JS, runs on Workers (STACK.md §4) |
| `hono` | 4.13.13 (Phase 1) | Routes `/api/admin/cases/:id/logics-push*` | Already the Worker framework |
| `@supabase/supabase-js` | 2.117.3 (Phase 1) | `rpc()` for claim/transition/finalize; Storage download of source bytes and upload of parts | Already the data client |
| `zod` | 4.6.5 (Phase 1) | Push request body, queue message envelope, Logics response type guards | Shared schemas (D-03) |
| Web platform (`FormData`, `File`, `btoa`, `crypto.subtle`) | Workers runtime | Multipart body, Basic header, SHA-256 fingerprints, AES-GCM decrypt | `FormData` file parts supported since compatibility date 2021-11-03 `[CITED: developers.cloudflare.com/workers/configuration/compatibility-flags — formdata_parser_supports_files]`; `btoa` used in Cloudflare's own Basic-auth tutorial `[CITED: developers.cloudflare.com/workers/tutorials/github-sms-notifications-using-twilio]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `unpdf` | 1.8.1, published 2026-08-13, MIT, repo unjs/unpdf `[VERIFIED: npm registry]` | Text extraction | **Not needed in Phase 5.** Listed in ROADMAP scope notes; the push path never reads PDF text. Do not install until Phase 7 needs it. |
| `msw` + `@msw/cloudflare` | 3.0.3 / 0.2.0 (STACK.md) | Mock the Logics host in Worker tests | Only if the `vi.fn()` fetch injection (Code Example 4) proves insufficient; the client takes `fetch` as a parameter, so MSW is optional |
| `browser-image-compression` | 2.0.2 (Phase 3 dependency) | JPEG re-encode on the phone | Phase 3 owns it; Phase 5 depends on its output being JPEG/PNG ≤ bucket cap |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@cantoo/pdf-lib` | original `pdf-lib` 1.17.1 | Unmaintained since 2022, no encrypted-PDF support `[VERIFIED: npm registry time.modified 2022-05-12]` |
| `@cantoo/pdf-lib` | `mupdf` (AGPL) | Licence conflicts with resale (STACK.md) |
| Ledger-row claim for per-case serialization | `pg_advisory_xact_lock` via RPC | A transaction-level advisory lock is released when the RPC returns `[CITED: .agents/skills/supabase-postgres-best-practices/references/lock-advisory.md — "Transaction-level lock (released on commit/rollback)"]`, so it cannot span the multi-second Logics POST that happens in a separate HTTP call; session locks are unreliable through PostgREST's pooled connections. The claim-by-state pattern (`for update skip locked` style) is what the same skill recommends for queues `[CITED: …/lock-skip-locked.md]` |
| Ledger-row claim | `max_concurrency: 1` on the whole queue | Would also serialize Phase 4 webhook jobs on the shared `resspark-jobs` queue; acceptable only as an emergency knob |
| Queue job for the activity note | Write the note inline from the push route | The note must list the outcome of every part, which is only known after the consumer finishes |
| Multipart via `FormData` | Hand-built boundary string | No reason; `FormData` + `File` is standard on Workers |

**Installation (inside `app/`):**
```bash
pnpm add @cantoo/pdf-lib@2.11.1
```

**Version verification (run before the Standard Stack table is trusted at plan time):**
```bash
pnpm view @cantoo/pdf-lib version time.modified license   # 2.11.1 / 2026-09-15 / MIT on 2026-10-10
```

## Package Legitimacy Audit

Seam run 2026-10-10: `gsd_run query package-legitimacy check --ecosystem npm @cantoo/pdf-lib unpdf`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@cantoo/pdf-lib` | npm | created 2021-03-12; latest 2026-09-15 | 884,625/wk | github.com/cantoo-scribe/pdf-lib | SUS (`too-new` = latest-release recency only) | Keep — `[WARNING: flagged as suspicious — verify before using.]` Planner adds one `checkpoint:human-verify` before `pnpm add` (a `pnpm view @cantoo/pdf-lib repository.url time.created` glance satisfies it). No `postinstall` script `[VERIFIED: seam signals postinstall: null]` |
| `unpdf` | npm | created 2023-08-11; latest 2026-08-13 | 5,573,749/wk | github.com/unjs/unpdf | OK | Approved but **not installed in Phase 5** (no text extraction here) |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@cantoo/pdf-lib` (recency signal only; 5-year-old package, canonical fork repo, Context7-indexed).

## Answers to the Six Planner Questions

### Q1. `POST /publicapi/V4/Documents/CaseDocument` from a Worker

**Contract (HIGH — read from the repo doc this session):** `[VERIFIED: Logics_API_Documentation.docx.md:943-974]`

> `https://valortax.logiqsapi.com/publicapi/V4/Documents/CaseDocument` · *This endpoint accepts multipart/form-data.* · **Required scope: case.write** · **Note:** Maximum uploaded file size is 6 MB per file — compress or optimize PDFs beforehand.
> | `CaseID` | Integer | Case to which the document is added | **Required** |
> | `Comment` | String | Comment to add to the document | **Optional** |
> | `FileCategoryID` | Integer | ID of the file category | **Optional** |
> | `File` | File (form-data) | The file to upload | **Required** |
> Example Response (200): `{ "Success": true, "data": { "CaseDocumentID": 128346 }, "message": "File uploaded succefully by User: Pedro Medina", "StatusCode": 200, "Timestamp": "2025-05-18T04:20:10.9999999Z" }`
> Response codes: **200** · **401** Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. · **403** Access denied. Missing required scope: case.write · **500** Internal Server Error. Please try again later or contact support.

**Auth:** `[VERIFIED: Logics_API_Documentation.docx.md:35-71]`
> Username: Your API Key · Password: Your Secret Token · `Authorization: Basic base64("<API Key>:<Secret Token>")`
> *Select an appropriate key based on your needs — GET permissions for read operations, POST permissions for write operations*

In a Worker: `Authorization: 'Basic ' + btoa(`${apiKey}:${secretToken}`)` `[CITED: Cloudflare Twilio tutorial uses btoa(`${accountSid}:${authToken}`)]`. Keys are ASCII; if a token ever contains non-Latin-1 characters `btoa` throws — treat that as a config error (`logics_bad_credentials`), do not fall back `[ASSUMED]`.

**Multipart body:** build `new FormData()`, `append('CaseID', String(caseId))`, `append('Comment', comment)`, `append('FileCategoryID', String(id))` only when configured, `append('File', new File([bytes], fileName, { type: 'application/pdf' }), fileName)`, pass it as `fetch` `body` and **do not set `Content-Type`** (the runtime sets the boundary). Workers' `FormData` represents file parts as `File` `[CITED: compatibility-flags formdata_parser_supports_files]`. The whole part (≤ 5.5 MiB) is in memory for the request; that is within the 128 MB isolate limit for one document at a time `[CITED: developers.cloudflare.com/workers/platform/limits — 128 MB]`.

**Response parsing (the only "sent" proof):** a type guard `isCaseDocumentCreated(x)` = `x.Success === true && Number.isInteger(x.data?.CaseDocumentID)`. Anything else on a 2xx → `unknown` (the server may have stored the file). Note the doc's own typo `succefully`: never match on `message`.

**Over-6 MB behaviour: unknown.** The doc lists no 413 or validation error `[VERIFIED: doc lists only 200/401/403/500]`. Plan for a pre-flight gate at `LOGICS_MAX_PART_BYTES = 5_767_168` (5.5 MiB). Both readings of "6 MB" are above it: 6,000,000 (SI) and 6,291,456 (MiB) `[VERIFIED: arithmetic]`. Multipart framing adds ~300 bytes, still under either. The gate is applied to the **saved bytes of each part**, in the consumer, immediately before the POST, and again in the route when estimating (the route only sees source sizes).

**What `CaseDocumentID` lets us do:** nothing readable. There is no GET/list/delete for documents `[VERIFIED: doc "Documents — 1 endpoint"]`. Store it on the ledger row for human reconciliation (and put it into the activity note), that is all.

**Status handling (prescriptive):**

| Observation | Ledger state | `error_code` | Retry allowed? |
|---|---|---|---|
| 200 + `CaseDocumentID` integer | `sent` | — | n/a |
| 2xx without parseable `CaseDocumentID` | `unknown` | `logics_unparsed_200` | staff decision |
| 401 | `failed` | `logics_auth` — also stop the rest of the batch and raise an admin notice (credentials rotated, C9) | after credentials fixed, staff "re-send" |
| 403 | `failed` | `logics_scope` (key lacks `case.write`) | same |
| other 4xx (undocumented) | `failed` | `logics_rejected_<status>` | staff "re-send" |
| 5xx | `unknown` | `logics_5xx` (PITFALLS C9: 5xx is ambiguous — the server received the body) | staff decision |
| timeout / network error / Worker eviction after the request was dispatched | `unknown` | `logics_no_response` | staff decision |
| error **before** `fetch` was called (size gate, decrypt failure, Storage read failure) | `failed` | specific code | `msg.retry()` is allowed for Storage/transient errors only because nothing was sent |

The only `msg.retry()` path is a failure that provably happened before the POST was dispatched. Once `fetch` has been awaited, the consumer must `ack` the message no matter what and record the state; the queue never re-delivers a send.

**Timeout:** wrap `fetch` with `AbortSignal.timeout(60_000)`; 5.5 MiB over a Worker egress finishes well inside that. Consumer CPU: keep the Phase 1 default 30 s unless splitter tests show more is needed; the knob is `"limits": { "cpu_ms": 300000 }` `[CITED: developers.cloudflare.com/workers/platform/limits — cpu_ms up to 300000 on Paid]`. Wall-clock for a consumer invocation is 15 minutes (STACK.md §4, from Cloudflare Queues limits) `[CITED: STACK.md citing developers.cloudflare.com/queues/platform/limits]`.

### Q2. `POST /publicapi/V4/CaseActivity/Activity`

**Contract (HIGH):** `[VERIFIED: Logics_API_Documentation.docx.md:874-905]`
> **Required scope: activity.write**
> | `CaseID` | Integer | **Required** | · | `ActivityType` | String | Type of activity to add to the case | **Required** | · | `Subject` | String | **Required** | · | `Comment` | String | Optional | · | `Popup` | Boolean | Optional | · | `Pin` | Boolean | Optional |
> Example Response (200): `{ "Success": true, "data": { "ActivityID": 9164821 }, "message": "Case activity created successfully created by User: Hazel Smith", … }`

The body is JSON (the doc calls it "Body Request", in contrast to the two endpoints explicitly marked multipart) `[ASSUMED — the doc never states the content type for JSON bodies; send `Content-Type: application/json` and verify on the first manual test]`.

**Allowed `ActivityType` values: not enumerated anywhere in the doc** `[VERIFIED: full-document read]`. One value is observable: the GET example returns `"ActivityType": "General"` `[VERIFIED: Logics_API_Documentation.docx.md:862]`. The Activity Report example shows `"Type": "Document sent"` `[VERIFIED: …:1123]` but that is a report column, not proven to be an accepted `ActivityType` input.

**Prescription:**
- Config key `logics.activity_type` in `firms.settings` (jsonb) with default `"General"` (the only observed value). Staff can change it on the Settings page from Phase 2 (LOOK-05).
- **Test connection extension (Phase 2's button gains one step):** `GET /publicapi/V4/CaseActivity/Activity` with header `CaseID: <test case>` (scope `case.read` `[VERIFIED: …:846-858]`), parse `data` defensively (the example shows a single object although the text says "list grows over time" — accept object **or** array), and display the distinct `ActivityType` strings found so the admin can pick one that exists. Header parameters are how every Logics GET takes input `[VERIFIED: doc "Header Parameters" tables]`; this is the same mechanism Phase 2 uses for `Find/*`.
- Subject: `Documents uploaded via ResSpark` (short; Logics shows it as the activity title). Comment: `Documents uploaded via ResSpark by {agent display name}: {file 1 (part 1 of 2)}, {file 1 (part 2 of 2)}, {file 2}` and, if any part is `unknown`, a trailing line `Unconfirmed (check case documents): {names}`. `Popup: false`, `Pin: false` `[ASSUMED defaults]`.
- Activity failure never affects document states; it has its own `activity_state` on the batch (`pending | sent | failed | unknown`) with the same status mapping as Q1.

### Q3. PDF work inside the Queue consumer (`normalizeForLogics`)

**Library facts** `[CITED: Context7 /cantoo-scribe/pdf-lib README + MIGRATION.md]`:
- `const src = await PDFDocument.load(bytes)`; `dest.copyPages(src, indices)` returns pages to `dest.addPage(page)`; `await dest.save()` returns a `Uint8Array` — its `byteLength` is the measurement.
- `PDFDocument.load(bytes, { ignoreEncryption: true })` then `doc.isEncrypted`; `PDFDocument.load(bytes, { password })` decrypts.
- `save({ objectsPerTick: Infinity })` speeds up saving (fewer yields) — use it in the consumer where there is no event loop to keep responsive.
- `embedJpg(bytes)` / `embedPng(bytes)` return `PDFImage` with `width`/`height`; `page.drawImage(img, { x, y, width, height })`. JPEG and PNG only; there is no HEIC decoder.
- `save({ useObjectStreams: true })` is the pdf-lib `SaveOptions` default `[ASSUMED — not shown in the Context7 excerpts; confirm in the installed typings; leave it at the default]`.

**Memory/CPU characteristics:** no authoritative benchmark exists for Workers. Web evidence (LOW) says pdf-lib holds the whole document graph in memory and `copyPages` duplicates shared resources (fonts, images) into each destination, so parts sum to more than the source and peak memory is roughly "source + current part + saved bytes" `[ASSUMED: dev.to/sunshey/how-to-merge-large-pdfs-in-the-browser-without-crashing; general PDF-engine forum threads]`. Prescriptions that make this safe regardless:
- One document per queue message (`max_batch_size: 1` already in Phase 1 config); never hold two sources.
- Input cap `LOGICS_MAX_SOURCE_BYTES = 40 MiB` `[ASSUMED]`: above it, skip normalization and mark `needs_manual_compression` (the Phase 3 bucket `fileSizeLimit` of ~25 MB makes this unreachable in practice; the cap is belt-and-braces for the 128 MB isolate).
- Release references between parts (`let part = await PDFDocument.create()` per part; do not keep an array of `PDFDocument`s, keep only `Uint8Array`s, and upload each part to Storage as soon as it is final).

**Greedy page accumulation with last-good-bytes (the algorithm):**
1. If `source.byteLength <= target` and it is a PDF → one part, bytes unchanged (no re-save: re-saving can change size and loses nothing we need).
2. Else `src = load(bytes, { ignoreEncryption: true })`. If `src.isEncrypted` → try `load(bytes, { password: '' })`; if that throws → `needs_manual_compression` with `error_code: pdf_encrypted` `[ASSUMED that cantoo's empty-password load behaves like a normal open for owner-password-only files; test with a fixture]`.
3. `part = create()`, `lastGood: Uint8Array | null = null`, `startIndex = 0`. For each page index `i`: `[p] = await part.copyPages(src, [i]); part.addPage(p); const saved = await part.save({ objectsPerTick: Infinity })`.
   - If `saved.byteLength <= target` → `lastGood = saved`, continue.
   - Else if `lastGood === null` (this single page alone exceeds the target) → stop: `needs_manual_compression`, `error_code: pdf_page_too_large`, with `page: i + 1` in the error payload.
   - Else emit `lastGood` as part `[startIndex, i)`, then `part = create()`, copy page `i` into it, save; if that alone is over → `pdf_page_too_large`; else `lastGood = saved`, `startIndex = i`.
4. After the loop emit `lastGood`. Name parts `{basename} (part {k} of {n}).pdf`; `n` is known only at the end, so name after the loop.
5. Re-check every emitted part against `target` before returning (defensive; the loop guarantees it).

Cost: one `save()` per page, O(pages × part size). A 60-page statement is ~60 saves of ≤ 5.5 MiB each — seconds of CPU, which is why this runs in the consumer. Add `shortcut: saves on every page, switch to a byte-ratio estimate with a final verification save when a real upload takes > 20 s`.

**Images → PDF:** sniff magic bytes (`FF D8 FF` JPEG, `89 50 4E 47` PNG) — never trust the stored MIME. One page per image sized to the image's pixel dimensions in points (`page = doc.addPage([img.width, img.height]); page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })`), then run the same size gate. One image → one single-page PDF; several images for the same request item → one multi-page PDF, which the splitter can split if it exceeds the target (page = image, so the gate becomes "one photo ≤ 5.5 MiB").

**HEIC:** cannot be decoded on Workers (no native codec, pdf-lib has none). Dependency on Phase 3: client-side compression must emit JPEG. The WebKit evidence is LOW and contradictory: iOS Safari transcodes HEIC → JPEG when the `accept` list is restricted and excludes HEIC, and including `image/heic` has caused PNG/JPG to be converted *to* HEIC on Safari 17+ `[ASSUMED: WebKit bugs 292350, 303803, 267277; Apple forum thread 743049]`. Phase 3 should therefore run `browser-image-compression` with `fileType: 'image/jpeg'` on every image regardless of what the picker returns, and verify magic bytes after compression. In Phase 5, a HEIC that still reaches the Worker → `needs_manual_compression`, `error_code: image_unsupported_format`, UI text "Ask the client to re-upload as JPG or PDF".

**When to mark "needs manual compression":** `pdf_page_too_large` (single page over target), `pdf_encrypted` (no empty-password open), `image_unsupported_format`, `source_too_large` (over the 40 MiB input cap), `pdf_unparseable` (`load` throws). All are terminal `failed` rows with a `needs_manual_compression = true` flag so the UI groups them; the staff action is "download, compress outside, re-upload to the item", which creates a new document and therefore a new push.

### Q4. Ledger design, `unknown`, resolution UI, per-case serial lock

**Migration `NNNN_logics_pushes.sql` (additive, RLS on, grants revoked per D-12):**

```sql
create table logics_push_batches (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  case_id uuid not null references cases(id),
  logics_case_id bigint not null,                       -- Integer in Logics
  created_by uuid not null,                             -- staff user id
  agent_display_name text not null,                     -- frozen for the note/comment
  comment text not null,                                -- Andrew's wording, user-editable
  mode text not null check (mode in ('live','fake')),
  activity_state text not null default 'pending'
    check (activity_state in ('pending','sending','sent','failed','unknown')),
  logics_activity_id bigint,
  activity_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table logics_pushes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references logics_push_batches(id),
  firm_id uuid not null references firms(id),
  case_id uuid not null references cases(id),
  document_id uuid not null,                            -- Phase 3 document row
  part_index int not null default 0,                    -- 0-based
  part_count int,                                       -- null until normalized
  file_name text not null,
  part_storage_path text,                               -- normalized bytes, null until normalized
  part_bytes int,
  file_category_id int,                                 -- snapshot of config at enqueue
  state text not null default 'queued'
    check (state in ('queued','sending','sent','failed','unknown')),
  needs_manual_compression boolean not null default false,
  logics_document_id bigint,
  request_fingerprint text not null,                    -- sha256(logics_case_id|doc sha256|part_index)
  error_code text,
  error text,                                           -- human text, never bytes
  attempts int not null default 0,
  sending_since timestamptz,
  resolved_by uuid,                                     -- staff who resolved an unknown
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on logics_pushes (case_id, state);
create unique index logics_pushes_fingerprint_live
  on logics_pushes (request_fingerprint) where state in ('sending','sent','unknown');
```

`[ASSUMED]` column set beyond the ones the phase description names; the partial unique index is the duplicate guard: a second row with the same fingerprint cannot enter `sending` while one is `sent`/`unknown`. The phase description's `firm_id, case_id, document_id, part_index, state, logics_document_id, request_fingerprint, error, attempts, created_at, updated_at` are all present.

**State machine (enforced in RPC with `where state = p_from`):**

| From | To | Who | Condition |
|---|---|---|---|
| `queued` | `sending` | consumer (`logics_push_claim`) | no other row for `case_id` is `sending` **and** fingerprint index allows it; sets `sending_since`, `attempts + 1` |
| `sending` | `sent` | consumer | 200 + `CaseDocumentID` |
| `sending` | `failed` | consumer | 4xx or pre-send failure |
| `sending` | `unknown` | consumer, or cron sweeper (`sending_since < now() - interval '10 minutes'`) | 5xx / no response / unparsed 2xx / consumer died |
| `unknown` | `sent` | staff ("I checked Logics, it is there"; optional `logics_document_id` typed in) | records `resolved_by` + event |
| `unknown` | `queued` | staff ("Re-send") | the only route back to a POST; `attempts` keeps counting; fingerprint index: the row itself leaves `unknown`, so re-claim is allowed |
| `unknown` | `failed` | staff ("Discard") | event recorded |
| `failed` | `queued` | staff ("Retry") | only when `needs_manual_compression = false` |

No transition from `sent`. Every transition inserts an `events` row via `log_event()` in the same transaction (D-11): actions `logics.push_queued`, `logics.push_sent`, `logics.push_failed`, `logics.push_unknown`, `logics.push_resolved`, `logics.activity_sent`.

**`unknown` semantics:** "ResSpark dispatched the file to Logics and did not get a readable answer. Logics may or may not have stored it. Nobody can look it up by API." The UI must say exactly that.

**Resolution UI (`/admin/cases/:id`, ledger panel):** rows grouped by batch; badges `queued` (grey), `sending` (blue, spinner), `sent` (green, shows `CaseDocumentID`), `failed` (red, shows human error), `unknown` (amber, "Needs your decision"), plus a `Simulated` badge on `mode='fake'` rows. Clicking an `unknown` row opens a dialog with the three actions above, each with a one-line consequence ("Re-send may create a duplicate in Logics if the first upload did arrive"). The "Push to Logics" sheet lists approved items with size, the computed plan (`will send as 1 file` / `will split into 3 parts` / `needs manual compression`), the comment pre-filled with `Uploaded by ResSpark, last ran by {agent}`, and the file category selector (from config). Items already `sent` or `unknown` for this case (by fingerprint) are shown disabled with "already pushed" unless the staff member ticks "push again".

**Queue message:** `{ type: 'logics.push_part', pushId, firmId }` only — ids, never bytes (STACK.md §5). One message per ledger row. The route enqueues after the batch RPC commits.

**Consumer flow per message:**
1. `claim = rpc('logics_push_claim', { push_id })` → if `null` (another part of this case is `sending`, or already terminal) → `msg.retry({ delaySeconds: 15 })` (nothing has been sent; retry is safe). Cap at the queue's `max_retries`; a message that keeps losing the claim ends in the DLQ, where the row is still `queued` and the cron re-enqueues it.
2. Re-run `logicsWriteGuard(env, logicsCaseId)` (flags may have changed since enqueue). If it throws → `failed`, `error_code: logics_write_blocked`.
3. Normalize if `part_storage_path` is null (first part of a document does the splitting and inserts sibling rows for parts 1..n-1 via `logics_push_add_parts`; they start `queued` and get their own messages). Store parts in a private `logics-parts/` prefix.
4. Decrypt credentials, build `LogicsClient` (or `FakeLogicsClient` when `mode='fake'`), POST, map the outcome with the Q1 table, `rpc('logics_push_transition', …)`, `msg.ack()` always.
5. `rpc('logics_push_finalize_batch', { batch_id })`: flips `activity_state` `pending → sending` only when no row of the batch is `queued`/`sending`; the caller that wins writes the activity note and sets `sent/failed/unknown`. Exactly-once by state flip.

**Cron (`*/15`, existing trigger):** `sending` older than 10 minutes → `unknown` (`error_code: consumer_lost`); `queued` rows with no in-flight message older than 5 minutes → re-enqueue (idempotent because claim is state-guarded).

### Q5. Demo safety: guard, allowlist, `LOGICS_MODE=fake`, UI labelling

- `logicsWriteGuard(env, caseId)` is Phase 1 code `[VERIFIED: 01-RESEARCH.md Code Example 9 — throws `logics_write_blocked` unless `LOGICS_WRITE_ENABLED === 'true'` and the id is in `LOGICS_TEST_CASE_IDS`]`. Phase 5 calls it in **both** the route (fail fast with a clear message: "Logics writes are disabled in this environment" / "Case {id} is not on the test allowlist") and the consumer. It applies in `fake` mode too, so the demo exercises the real gate.
- New var `LOGICS_MODE` ∈ `live | fake`, default `fake` in `wrangler.jsonc` `vars` until write scopes are confirmed `[ASSUMED name]`. `fake` swaps the client factory: `FakeLogicsClient.createCaseDocument()` returns `{ CaseDocumentID: <random positive int> }` after a 300 ms delay, `createActivity()` likewise; it never opens a socket. Rows and batches are stamped `mode='fake'`.
- `/api/config` (Phase 1) adds `logics_mode`; the SANDBOX banner text becomes "SANDBOX · Logics writes simulated" when `fake`. Ledger rows show the `Simulated` badge; the push sheet's button reads "Push to Logics (simulated)". The activity-note preview is still shown so Andrew sees the exact text that would land in Logics.
- The fake also powers tests: inject outcomes by constructor option (`new FakeLogicsClient({ outcome: 'unknown' })`), not by env, so production code has one branch.
- Credentials are not needed in `fake` mode; the consumer skips decryption. In `live` mode with missing credentials → `failed`, `error_code: logics_no_credentials`, and the route refuses before enqueueing.

### Q6. Credentials: reading Phase 2's encrypted key + secret

Phase 2 (LOOK-05) stores the firm's API key and secret token encrypted server-side. Table and column names are Phase 2's to decide; this research assumes `firm_integrations(firm_id, provider='logics', api_key_ct bytea, secret_ct bytea, iv bytea, base_url text, …)` `[ASSUMED]` with AES-GCM via `crypto.subtle` and a 256-bit key held as Worker secret `INTEGRATION_ENC_KEY` `[ASSUMED name]`. Phase 5 adds a single `getLogicsCredentials(firmId)` in the data-access module that returns `{ baseUrl, apiKey, secretToken }` in memory for one job and nothing else — never cached at module scope, never logged (D-20 allowlist already excludes it).

Basic header: `Basic base64("<API Key>:<Secret Token>")` `[VERIFIED: Logics_API_Documentation.docx.md:71]` — username = API Key, password = Secret Token (not the other way round). Base URL per firm (`https://valortax.logiqsapi.com/publicapi/V4/` for ValorTax `[VERIFIED: doc:9]`); validate at config time that the host ends with `.logiqsapi.com` to rule out SSRF via a pasted URL `[ASSUMED hostname pattern — the doc shows one tenant only]`.

Scope reality check: the doc says one key carries "GET permissions for read operations, POST permissions for write operations" and `CaseDocument` needs `case.write`, `Activity` needs `activity.write` `[VERIFIED: doc:17-29, 949, 880]`. PITFALLS C1 wants a read-only key for the demo and a write key only in production; with `LOGICS_MODE=fake` the demo needs no write key at all.

## Architecture Patterns

### System Architecture Diagram

```
Staff (SPA /admin/cases/:id)
   │ select approved items, comment, category → POST /api/admin/cases/:id/logics-push
   ▼
Hono route ── zod body ── logicsWriteGuard(env, logicsCaseId) ── credentials present? (live only)
   │ rpc logics_push_create_batch (batch + N queued rows + events)   ── commits
   │ env.JOBS.send({type:'logics.push_part', pushId}) × N
   ▼
Queue resspark-jobs ── consumer (max_batch_size 1)
   │ rpc logics_push_claim(pushId)  ──no claim──▶ msg.retry(15 s)   [nothing sent yet]
   │ logicsWriteGuard again
   │ normalizeForLogics (Storage → bytes → image→PDF / split ≤ 5,767,168 B → parts to Storage)
   │     └─ too big / encrypted / HEIC ──▶ failed + needs_manual_compression
   │ LogicsClient | FakeLogicsClient ── POST Documents/CaseDocument (multipart, Basic)
   │     200+CaseDocumentID → sent · 4xx → failed · 5xx/timeout/unparsed → unknown
   │ rpc logics_push_transition (+events) · msg.ack() ALWAYS after dispatch
   │ rpc logics_push_finalize_batch ──wins──▶ POST CaseActivity/Activity (one note per batch)
   ▼
Ledger panel (polling 5–10 s) ── unknown rows → staff dialog → rpc transition (sent | queued | failed)
Cron */15 ── sending > 10 min → unknown · orphaned queued → re-enqueue
```

### Recommended Project Structure (all under 500 lines; each file gets `docs/app/…` companion)

```
app/worker/src/integrations/logics/
├── write-guard.ts            # Phase 1 (exists after Phase 1)
├── client.ts                 # LogicsClient: createCaseDocument, createActivity, listActivities (fetch injected)
├── client-fake.ts            # FakeLogicsClient (same interface, outcome injectable)
├── types.ts                  # zod schemas + type guards for responses
└── credentials.ts            # getLogicsCredentials(firmId) → decrypt (reads Phase 2 table)
app/worker/src/jobs/
├── logics-push.ts            # queue handler for 'logics.push_part'
└── logics-push-finalize.ts   # activity note after last part
app/worker/src/pdf/
├── normalize-for-logics.ts   # orchestrates: sniff → image-to-pdf | split → parts
├── split-pdf.ts              # greedy splitter (pure: (bytes, targetBytes) → parts | error)
└── image-to-pdf.ts           # (jpeg|png bytes[]) → pdf bytes
app/worker/src/routes/admin/logics-push.ts   # POST create batch, GET ledger, POST resolve
app/worker/src/db/logics-pushes.ts           # rpc wrappers
supabase/migrations/NNNN_logics_pushes.sql   # tables + RPCs + RLS/grants
app/src/features/cases/logics-push/          # PushSheet.tsx, LedgerPanel.tsx, ResolveUnknownDialog.tsx
```

### Pattern 1: Client with injected `fetch`, outcome-typed result
**What:** `LogicsClient` never throws for HTTP outcomes; it returns a discriminated union `{ kind: 'sent', id } | { kind: 'failed', status, code } | { kind: 'unknown', code }` so the consumer maps it straight onto the ledger.
**When to use:** every Logics call. Tests pass a `vi.fn()` fetch.

### Pattern 2: Claim-by-state instead of locks
**What:** `update logics_pushes set state='sending', sending_since=now(), attempts=attempts+1 where id=$1 and state='queued' and not exists (select 1 from logics_pushes p where p.case_id=logics_pushes.case_id and p.state='sending') returning *` inside the RPC. Postgres row-level locking makes two concurrent consumers race safely; the loser gets zero rows.
**When to use:** per-case serialization and the batch finalize flip.

### Pattern 3: Ack-after-dispatch
**What:** once `await fetch(...)` has started, the message is acknowledged unconditionally in a `finally`; the ledger (not the queue) carries the outcome.
**When to use:** any non-idempotent external write.

### Anti-Patterns to Avoid
- **`msg.retry()` after the POST** — creates duplicates Logics cannot delete (PUSH-04).
- **Deriving "sent" from a 200 status alone** — the body must contain `CaseDocumentID`.
- **Trusting `max_concurrency` for ordering** — Queues order is best effort `[CITED: developers.cloudflare.com/workers/llms-full.txt — "Ordering of messages is best effort -- not guaranteed"]`.
- **Loading the PDF in the request path** — 128 MB / CPU limits (C14); the route only reads `size_bytes` from the document row.
- **Caching credentials or the client at module scope** — cross-request state; also D-07.
- **Putting `logics_case_id` in the request body** — take it from the `cases` row (C3/C8).
- **Logging the Logics response body** — it contains the user name of the Logics account; log only `status` and `error_code`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF parsing/splitting | A PDF object parser | `@cantoo/pdf-lib` `copyPages` | Cross-reference tables, object streams, shared resources |
| Multipart encoding | Boundary string concatenation | `FormData` + `File` in `fetch` body | Runtime sets boundary and `Content-Type`; File parts supported `[CITED]` |
| Image decoding | Any decoder | `embedJpg`/`embedPng` (pass-through, no decode) | Workers have no native codecs; HEIC is a Phase 3 client-side concern |
| Exactly-once across workers | Distributed lock service / Durable Object | State-guarded `UPDATE … WHERE state = …` RPC | Postgres row locks already give atomic claim; DOs are out of scope (STACK.md §5) |
| Audit trail | Separate logging | `log_event()` inside the same RPC | D-11 atomicity |
| Credential crypto | Custom cipher | `crypto.subtle` AES-GCM (Phase 2) | ASVS V6 |

**Key insight:** every hard part of this phase is a *state* problem, not a *code* problem. The ledger's `WHERE state = …` clauses are the product.

## Runtime State Inventory

> Omitted: greenfield phase (no rename/refactor/migration of existing runtime state). The only pre-existing state touched is the Supabase project, by additive migration.

## Common Pitfalls

### Pitfall 1: A retried queue message re-sends a document
**What goes wrong:** Consumer throws after `fetch` resolved slowly; Queues redeliver; Logics now has two copies and no delete API.
**Why it happens:** Default queue semantics are at-least-once; `throw` = retry.
**How to avoid:** Ack-after-dispatch pattern; the claim RPC refuses to move a non-`queued` row; the fingerprint partial unique index refuses a second live row.
**Warning signs:** `attempts > 1` on a `sent` row; two rows with the same fingerprint.

### Pitfall 2: 200 without `CaseDocumentID` treated as success
**What goes wrong:** Logics' "super weird" behaviour (Andrew) returns 200 with an error `message`; the ledger says `sent`, the file is missing.
**How to avoid:** Type guard on `data.CaseDocumentID`; everything else is `unknown`.
**Warning signs:** `sent` rows with null `logics_document_id` — add a DB `check (state <> 'sent' or logics_document_id is not null)`.

### Pitfall 3: Stale `sending` rows block a case forever
**What goes wrong:** Consumer evicted mid-upload; the row stays `sending`; the claim RPC refuses every other part of that case.
**How to avoid:** Cron sweeper `sending_since < now() - 10 min → unknown`; UI shows "stuck?" after 2 minutes with a manual "mark unknown" action for staff.

### Pitfall 4: Parts sum larger than the source and the last part is tiny
**What goes wrong:** `copyPages` duplicates fonts/images per part; a 7 MB source becomes 3 parts of 5.4, 5.2, 0.3 MB.
**How to avoid:** Accept it (correctness over size); name parts clearly; show the plan in the push sheet before the click. If a source is just over the target, re-saving it alone can push it under (object streams) — try `save()` of the untouched source once before splitting `[ASSUMED optimization; measure in tests]`.

### Pitfall 5: `FileCategoryID` wrong or missing
**What goes wrong:** Documents land in Logics' default category and staff cannot find them.
**How to avoid:** Config table seeded per firm from Andrew's list (open item f in Phase 1); push sheet shows the category name; omit the field entirely when unconfigured (it is optional) rather than sending `0`.

### Pitfall 6: Activity note written before all parts are terminal
**How to avoid:** `logics_push_finalize_batch` flips only when no row is `queued`/`sending`; the note lists `sent` names and flags `unknown` ones.

### Pitfall 7: Demo shows `Simulated` and nobody says so
**How to avoid:** Banner text, button label and row badge all change in `fake` mode; the demo script says "this is the recorded fake because write scopes are unconfirmed" (ROADMAP Demo Cut).

## Code Examples

### 1. `LogicsClient.createCaseDocument` (multipart + Basic)
```ts
// Source: Logics_API_Documentation.docx.md:943-974 (fields), :71 (auth); Cloudflare btoa tutorial
export type DocResult =
  | { kind: 'sent'; logicsDocumentId: number }
  | { kind: 'failed'; status: number; code: string }
  | { kind: 'unknown'; code: string }

export function createLogicsClient(creds: { baseUrl: string; apiKey: string; secretToken: string }, fetchImpl = fetch) {
  const auth = 'Basic ' + btoa(`${creds.apiKey}:${creds.secretToken}`)
  return {
    async createCaseDocument(p: { caseId: number; comment: string; fileCategoryId?: number; fileName: string; bytes: Uint8Array }): Promise<DocResult> {
      if (p.bytes.byteLength > LOGICS_MAX_PART_BYTES) return { kind: 'failed', status: 0, code: 'size_gate' } // never dispatched
      const fd = new FormData()
      fd.append('CaseID', String(p.caseId))
      fd.append('Comment', p.comment)
      if (p.fileCategoryId !== undefined) fd.append('FileCategoryID', String(p.fileCategoryId))
      fd.append('File', new File([p.bytes], p.fileName, { type: 'application/pdf' }), p.fileName)
      let res: Response
      try {
        res = await fetchImpl(new URL('Documents/CaseDocument', creds.baseUrl), {
          method: 'POST', headers: { Authorization: auth }, body: fd, signal: AbortSignal.timeout(60_000),
        })
      } catch { return { kind: 'unknown', code: 'logics_no_response' } }   // dispatched; outcome unknown
      if (res.status === 401) return { kind: 'failed', status: 401, code: 'logics_auth' }
      if (res.status === 403) return { kind: 'failed', status: 403, code: 'logics_scope' }
      if (res.status >= 500) return { kind: 'unknown', code: 'logics_5xx' }
      if (res.status >= 400) return { kind: 'failed', status: res.status, code: `logics_rejected_${res.status}` }
      const body: unknown = await res.json().catch(() => null)
      return isCaseDocumentCreated(body)
        ? { kind: 'sent', logicsDocumentId: body.data.CaseDocumentID }
        : { kind: 'unknown', code: 'logics_unparsed_200' }
    },
  }
}
export const LOGICS_MAX_PART_BYTES = 5_767_168  // 5.5 MiB < 6,000,000 and < 6,291,456
```

### 2. Response type guard (zod 4)
```ts
// Source: Logics_API_Documentation.docx.md:964 example response
const CaseDocumentCreated = z.object({ Success: z.literal(true), data: z.object({ CaseDocumentID: z.number().int() }) })
export const isCaseDocumentCreated = (x: unknown): x is z.infer<typeof CaseDocumentCreated> => CaseDocumentCreated.safeParse(x).success
const ActivityCreated = z.object({ Success: z.literal(true), data: z.object({ ActivityID: z.number().int() }) })
```

### 3. Claim RPC (plpgsql)
```sql
-- Source: pattern from .agents/skills/supabase-postgres-best-practices/references/lock-skip-locked.md
create or replace function logics_push_claim(p_push_id uuid) returns logics_pushes
language plpgsql security definer set search_path = public as $$
declare r logics_pushes;
begin
  update logics_pushes lp
     set state = 'sending', sending_since = now(), attempts = attempts + 1, updated_at = now()
   where lp.id = p_push_id and lp.state = 'queued'
     and not exists (select 1 from logics_pushes o where o.case_id = lp.case_id and o.state = 'sending')
  returning * into r;
  if r.id is not null then
    perform log_event(r.firm_id, r.case_id, null, 'system', 'queue', 'logics.push_sending', jsonb_build_object('push_id', r.id));
  end if;
  return r;   -- null row when not claimed
end $$;
```
(`log_event` signature is Phase 1's; adapt to its final shape.)

### 4. Consumer handler skeleton
```ts
// Source: Cloudflare Queues consumer API (ack/retry), this research Q4
export async function handleLogicsPushPart(msg: Message<{ pushId: string }>, env: Env) {
  const row = await db.claimPush(env, msg.body.pushId)
  if (!row) { msg.retry({ delaySeconds: 15 }); return }           // nothing sent yet
  let outcome: DocResult
  try {
    logicsWriteGuard(env, String(row.logics_case_id))
    const part = await ensureNormalized(env, row)                   // may return { failed: 'pdf_page_too_large' }
    if ('failed' in part) { await db.transition(env, row.id, 'sending', 'failed', { code: part.failed, manual: true }); return }
    const client = env.LOGICS_MODE === 'fake' ? createFakeLogicsClient() : createLogicsClient(await getLogicsCredentials(env, row.firm_id))
    outcome = await client.createCaseDocument({ caseId: row.logics_case_id, comment: buildComment(row), fileCategoryId: row.file_category_id ?? undefined, fileName: part.fileName, bytes: part.bytes })
  } catch (e) {
    await db.transition(env, row.id, 'sending', 'failed', { code: errorCode(e) }); return   // pre-dispatch failure
  } finally { msg.ack() }                                           // never redeliver after dispatch
  await db.transition(env, row.id, 'sending', outcome.kind, outcome)
  await finalizeBatchIfDone(env, row.batch_id)
}
```

### 5. Greedy splitter (pure, testable)
```ts
// Source: Context7 /cantoo-scribe/pdf-lib — load/copyPages/addPage/save
import { PDFDocument } from '@cantoo/pdf-lib'
export type SplitResult = { parts: Uint8Array[] } | { error: 'pdf_page_too_large'; page: number } | { error: 'pdf_encrypted' | 'pdf_unparseable' }
export async function splitPdf(bytes: Uint8Array, targetBytes: number): Promise<SplitResult> {
  if (bytes.byteLength <= targetBytes) return { parts: [bytes] }
  let src: PDFDocument
  try { src = await PDFDocument.load(bytes, { ignoreEncryption: true }) } catch { return { error: 'pdf_unparseable' } }
  if (src.isEncrypted) { try { src = await PDFDocument.load(bytes, { password: '' }) } catch { return { error: 'pdf_encrypted' } } }
  const parts: Uint8Array[] = []
  let part = await PDFDocument.create(); let lastGood: Uint8Array | null = null
  for (let i = 0; i < src.getPageCount(); i++) {
    const [p] = await part.copyPages(src, [i]); part.addPage(p)
    let saved = await part.save({ objectsPerTick: Infinity })
    if (saved.byteLength <= targetBytes) { lastGood = saved; continue }
    if (!lastGood) return { error: 'pdf_page_too_large', page: i + 1 }
    parts.push(lastGood)
    part = await PDFDocument.create(); const [q] = await part.copyPages(src, [i]); part.addPage(q)
    saved = await part.save({ objectsPerTick: Infinity })
    if (saved.byteLength > targetBytes) return { error: 'pdf_page_too_large', page: i + 1 }
    lastGood = saved
  }
  if (lastGood) parts.push(lastGood)
  return { parts }   // shortcut: one save per page; estimate-then-verify if a real upload takes > 20 s
}
```

### 6. Activity note
```ts
// Source: Logics_API_Documentation.docx.md:874-895
await client.createActivity({
  CaseID: batch.logics_case_id,
  ActivityType: cfg.activityType ?? 'General',          // only value observed in the doc (GET example)
  Subject: 'Documents uploaded via ResSpark',
  Comment: `Documents uploaded via ResSpark by ${batch.agent_display_name}: ${sentNames.join(', ')}` +
           (unknownNames.length ? `\nUnconfirmed (check case documents): ${unknownNames.join(', ')}` : ''),
  Popup: false, Pin: false,
})
```
Per-document `Comment` on the upload: `Uploaded by ResSpark, last ran by ${agent} · ${originalName}${partSuffix} · rs:${document_id}` (Andrew's wording + the UUID for reconciliation, C9).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pdf-lib` 1.17.1 | `@cantoo/pdf-lib` 2.x fork | original frozen 2022-05 `[VERIFIED: npm]` | Encrypted-PDF support, maintained |
| Retry everything via queue | Ack-after-dispatch + ledger | — | Required by PUSH-04 with a no-list API |
| Advisory locks for job serialization | State-guarded claim | — | Works through PostgREST (stateless HTTP) |

**Deprecated/outdated:** `@cloudflare/vitest-pool-workers` (renamed, Phase 1); legacy Supabase `service_role` key (use `sb_secret_`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Over-6 MB uploads return some 4xx/5xx; behaviour undocumented | Q1 | Low — the pre-flight gate means it never happens |
| A2 | `ActivityType: "General"` is accepted as input (only observed in a GET example) | Q2 | Medium — note fails with 500/4xx; config + test-connection listing fixes it; document states unaffected |
| A3 | `CaseActivity/Activity` POST takes a JSON body with `Content-Type: application/json` | Q2 | Medium — first manual test; fallback is `application/x-www-form-urlencoded` |
| A4 | `FileCategoryID` values come from Andrew (no lookup endpoint) | Q2/Pitfall 5 | Low — field is optional; omit until known |
| A5 | `save({ useObjectStreams })` defaults to true in `@cantoo/pdf-lib` | Q3 | Low — size only |
| A6 | Empty-password `load` opens owner-password-only PDFs | Q3 | Low — falls to `pdf_encrypted` manual state |
| A7 | pdf-lib peak memory ≈ source + part + saved bytes; 40 MiB input cap is safe under 128 MB | Q3 | Medium — consumer OOM → row becomes `unknown` via sweeper, not duplicate; lower the cap if observed |
| A8 | iOS Safari HEIC transcoding behaviour (WebKit bug reports) | Q3 | Low for Phase 5 (HEIC → manual state); Phase 3 must force JPEG output |
| A9 | Column/table names beyond the phase description; `LOGICS_MODE`, `INTEGRATION_ENC_KEY`, `firm_integrations` names | Q4–Q6 | Low — naming |
| A10 | Logics tenant host pattern `*.logiqsapi.com` for SSRF validation | Q6 | Low — relax if a firm has another host |
| A11 | Comment length limit unknown; cap at 500 chars | Q4 | Low |
| A12 | `btoa` on non-Latin-1 credentials should be a config error | Q1 | Negligible |
| A13 | Re-saving an untouched source can shrink it under the target | Pitfall 4 | Negligible (optimization) |

## Open Questions

1. **Write scopes and key issuance (blocks `live` mode, not the demo)**
   - What we know: `CaseDocument` needs `case.write`, `Activity` needs `activity.write`; keys carry GET/POST permissions; no sandbox tenant is documented.
   - What's unclear: whether Andrew will issue a POST-capable key and 2–3 fake test cases before Oct 12.
   - Recommendation: default `LOGICS_MODE=fake`; the plan's last task is a `checkpoint:human-verify` "manual push to test CaseID" that flips to `live` only with the allowlist populated.
2. **`ActivityType` and `FileCategoryID` values** — open item (f) from Phase 1; resolved by Andrew or by the test-connection GET listing. Config has defaults (`General`, omitted) so nothing blocks.
3. **Does a 200 ever come back without `CaseDocumentID`?** Unknowable without a key; the `unknown` path covers it.
4. **Consumer CPU for large splits** — keep 30 s default; raise `limits.cpu_ms` if the splitter test on a generated 20 MB / 40-page fixture exceeds ~10 s on `wrangler dev`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | toolchain | ✓ | v24.14.0 `[VERIFIED: local]` | — |
| pnpm | installs | ✓ | 10.32.1 `[VERIFIED: local]` | — |
| Python | fixture generation (optional) | ✓ | 3.11.15 `[VERIFIED: local]` | generate fixtures in TS instead |
| wrangler | deploy, queue | ✓ (Phase 1) | 4.149.0 `[VERIFIED: 01-RESEARCH F-12]` | — |
| Workers Paid | CPU > 10 ms, subrequests | ✓ | confirmed in 01-CONTEXT D-06 update (supersedes 01-RESEARCH F-1) | none — required |
| Cloudflare Queue `resspark-jobs` + DLQ | consumer | ✗ until Phase 1 executes (`app/` does not exist yet `[VERIFIED: ls]`) | — | — (Phase 1 prerequisite) |
| Supabase project + CLI | migration, RPC | ✓ | CLI 2.120.0 `[VERIFIED: 01-RESEARCH F-10]` | — |
| Logics credentials (write) | `live` mode | ✗ none in repo | — | `LOGICS_MODE=fake` |
| Logics sandbox | realistic tests | ✗ does not exist | — | `FakeLogicsClient` + fixtures |
| Large PDF fixtures | splitter tests | ✗ — every file under `examples/` is 2–3 KB `[VERIFIED: find -printf]` | — | generate at test time with pdf-lib (random PNG bytes per page) and a small `targetBytes` |
| HEIC fixture | unsupported-format test | ✗ | — | 12-byte magic-header stub (`ftypheic`) |

**Missing dependencies with no fallback:** none for the demo path.
**Missing dependencies with fallback:** Logics write key (fake mode), large fixtures (generated), queue (Phase 1 prerequisite).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3, projects `web` (jsdom/node for pure modules) and `worker` (`@cloudflare/vitest-plugin` 1.4.0) per D-21 |
| Config file | `app/vitest.config.ts` (Phase 1) |
| Quick run command | `pnpm vitest run --project web worker/src/pdf worker/src/integrations/logics` |
| Full suite command | `pnpm vitest run` (plus `python -m unittest discover -s src/tests -v` unchanged) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUSH-01 | Multipart fields, Basic header, `CaseDocumentID` → `sent`; 401/403 → `failed`; 5xx/timeout/unparsed 200 → `unknown`; size gate refuses before dispatch | unit (injected `fetch`) | `pnpm vitest run --project web worker/src/integrations/logics/client.test.ts` | ❌ Wave 0 |
| PUSH-01 | Route: refuses unapproved items, refuses when guard throws (message text), creates batch + rows + events | worker (`app.request()` + fake db) | `pnpm vitest run --project worker worker/src/routes/admin/logics-push.test.ts` | ❌ Wave 0 |
| PUSH-01 | Ledger panel renders five states + `Simulated` badge | component (jsdom) | `pnpm vitest run --project web src/features/cases/logics-push/ledger-panel.test.tsx` | ❌ Wave 0 |
| PUSH-02 | `splitPdf`: ≤ target → identical bytes; generated 12-page fixture with `targetBytes=200_000` → every part ≤ target, page count sums to 12, parts open with `PDFDocument.load`; single oversized page → `pdf_page_too_large` with page number; garbage bytes → `pdf_unparseable`; `examples/**/*.pdf` all pass through unchanged | unit | `pnpm vitest run --project web worker/src/pdf/split-pdf.test.ts` | ❌ Wave 0 |
| PUSH-02 | `imageToPdf`: tiny JPEG and PNG fixtures → one page each with image dimensions; HEIC stub → `image_unsupported_format` | unit | `pnpm vitest run --project web worker/src/pdf/image-to-pdf.test.ts` | ❌ Wave 0 |
| PUSH-02 | `LOGICS_MAX_PART_BYTES === 5_767_168` and client refuses a `5_767_169`-byte part without calling `fetch` | unit | (in `client.test.ts`) | ❌ Wave 0 |
| PUSH-03 | Finalize flips `pending → sending` exactly once with two concurrent callers; note text lists sent names and flags unknown ones | unit (text builder) + integration (RPC, env-gated like `rls.test.ts`) | `pnpm vitest run --project web worker/src/jobs/logics-push-finalize.test.ts`; `LIVE_DB=1 pnpm vitest run --project worker worker/test/logics-rpc.test.ts` | ❌ Wave 0 |
| PUSH-04 | State machine: every allowed transition passes, every other pair is rejected; claim refuses when a sibling is `sending`; fingerprint index blocks a duplicate live row; consumer `ack`s after dispatch on every outcome and `retry`s only on a lost claim | unit (transition table) + worker (fake queue `Message`) + integration (RPC) | `pnpm vitest run --project web worker/src/db/push-state.test.ts`; `pnpm vitest run --project worker worker/src/jobs/logics-push.test.ts` | ❌ Wave 0 |
| PUSH-04 | Resolve dialog: three actions call the transition endpoint with the right `to` state | component | `pnpm vitest run --project web src/features/cases/logics-push/resolve-unknown-dialog.test.tsx` | ❌ Wave 0 |
| PLAT-05 | Guard enforced in route and consumer in both modes | unit | (covered in route + job tests) | ❌ Wave 0 |
| Manual | Live push of one `examples/` PDF to a Logics test CaseID with `LOGICS_MODE=live`, `LOGICS_WRITE_ENABLED=true`, allowlist set; verify the document and the activity note in the Logics UI; record `CaseDocumentID` and `ActivityID` in the plan summary | manual (`checkpoint:human-verify`) | — | n/a |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --project web worker/src/pdf worker/src/integrations/logics worker/src/db`
- **Per wave merge:** `pnpm vitest run` + `pnpm check` (500-line + lint)
- **Phase gate:** full suite green, the env-gated RPC test green against the live project, then the manual live push (or an explicit "fake mode only" note) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `app/worker/src/pdf/test-fixtures.ts` — `makeMultiPagePdf(pages, bytesPerPage)` (embeds random PNG bytes so pages are incompressible) and `makeOversizedPagePdf()`; tiny JPEG/PNG byte literals; HEIC magic stub
- [ ] `app/worker/src/integrations/logics/client-fake.ts` — outcome-injectable fake used by job and route tests
- [ ] `app/worker/test/logics-rpc.test.ts` — env-gated (`LIVE_DB`) claim/transition/finalize concurrency tests, modelled on Phase 1's `rls.test.ts`
- [ ] Fake queue `Message` helper (`ack`/`retry` spies) if `@cloudflare/vitest-plugin` does not expose one cleanly
- [ ] Framework install: none (Vitest and the Workers plugin arrive in Phase 1)

## Security Domain

### Applicable ASVS Categories (level 1, `security_enforcement: true`)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Staff JWT (Phase 1 `jose`/JWKS) on every `/api/admin/*` push route; Logics Basic auth built per job from decrypted firm credentials |
| V3 Session Management | no (stateless API) | — |
| V4 Access Control | yes | `firm_id` scoping in the data-access module; `logics_case_id` read from the `cases` row, never the body; `logicsWriteGuard` server-side in route and consumer |
| V5 Input Validation | yes | zod: `{ itemIds: uuid[] (1..50), comment: string (1..500), fileCategoryId?: int }`; queue envelope schema; Logics response guards; magic-byte sniffing of stored files |
| V6 Cryptography | yes | `crypto.subtle` AES-GCM for credentials (Phase 2), SHA-256 fingerprints; never hand-rolled |
| V7 Error Handling & Logging | yes | Allowlisted logger; `error` column holds human text, never response bodies or bytes; `error_code` enumerated |
| V10 Malicious Code / SSRF | yes | Base URL from firm config validated to `https://*.logiqsapi.com/…`; no user-supplied URLs |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Duplicate document in Logics via retry | Tampering (integrity of the case file) | Ack-after-dispatch, `unknown` state, fingerprint partial unique index, staff-only re-send |
| Push to the wrong/real case during demo | Tampering / Information disclosure | `logicsWriteGuard` + allowlist in route and consumer; `fake` default; banner |
| Credential leakage in logs/errors | Information disclosure | D-20 allowlist; credentials scoped to one job; `401` mapped to a code, body discarded |
| Cross-firm push (IDOR on `caseId`) | Elevation of privilege | `firm_id` predicate from the verified staff profile on every query/RPC |
| Oversized/zip-bomb PDF exhausting the consumer | Denial of service | Input cap, one document per message, bucket `fileSizeLimit` (Phase 3), consumer DLQ |
| Spoofed "sent" via forged 200 (MITM) | Spoofing | HTTPS only to the Logics host; validated base URL |
| Agent name / file name injection into the Logics note | Tampering | Plain text, length-capped; file names sanitized to `[A-Za-z0-9 ._()-]` before use in `File` name and note |

## Sources

### Primary (HIGH confidence)
- `C:/Users/John Doe/Documents/Tax Proplem/Logics_API_Documentation.docx.md` — auth guide (lines 31–92), `CaseActivity/Activity` GET/POST (846–905), `Documents/CaseDocument` (943–974), scope table (17–29); whole document read
- `.planning/REQUIREMENTS.md`, `ROADMAP.md` (Phase 5, Demo Cut), `PROJECT.md`, `research/SUMMARY.md`, `research/PITFALLS.md` (C1, C8, C9, C14), `research/STACK.md` (§4 PDFs, §5 Queues), `phases/01-foundation-staff-sign-in/01-CONTEXT.md` (D-06 Paid update, D-19) and `01-RESEARCH.md` (Code Example 9, F-10/F-12)
- npm registry (`npm view`, 2026-10-10): `@cantoo/pdf-lib` 2.11.1, `pdf-lib` 1.17.1, `unpdf` 1.8.1
- Local probes: `examples/` file sizes, toolchain versions, absence of `app/`

### Secondary (MEDIUM confidence)
- Context7 `/cantoo-scribe/pdf-lib` (README, MIGRATION.md): `copyPages`, `embedJpg/embedPng`, `ignoreEncryption`/`password`, `objectsPerTick`
- Context7 `/llmstxt/developers_cloudflare_workers_llms-full_txt`: Queues consumer options and best-effort ordering, `MessageBatch`/`retry`, `limits.cpu_ms`, 128 MB memory and streaming guidance, `formdata_parser_supports_files`, `btoa` Basic-auth tutorial
- `.agents/skills/supabase-postgres-best-practices/references/lock-advisory.md`, `lock-skip-locked.md`

### Tertiary (LOW confidence)
- WebSearch: pdf-lib memory behaviour (dev.to/sunshey; generic PDF forums); iOS Safari HEIC transcoding (WebKit bugs 292350, 303803, 267277; Apple forum 743049; `heic-normalize` npm — unverified package, not recommended)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — one new package, verified on the registry and Context7-indexed
- Logics contract: HIGH on field names/auth/response shape (vendor doc); MEDIUM on live behaviour (no sandbox, no key, only 200/401/403/500 documented)
- Architecture (ledger, claim, ack-after-dispatch): MEDIUM-HIGH — standard patterns; the RPC concurrency tests are what make it HIGH
- PDF normalization: MEDIUM — API verified, memory/CPU envelope assumed until the generated-fixture tests run on `wrangler dev`
- Pitfalls: MEDIUM-HIGH — derived from the documented API gaps and Queues semantics

**Research date:** 2026-10-10
**Valid until:** 2026-11-10 for platform facts; the Logics items should be re-checked the day a write-scoped key arrives
