---
phase: 01-foundation-staff-sign-in
plan: 08
subsystem: infra
tags: [spikes, supabase-storage, tus, signed-upload, truv, resend, logics, operator-docs]

# Dependency graph
requires:
  - phase: 01-03
    provides: "spike (a) result, deployed URL, queue outcome"
  - phase: 01-05
    provides: "app/.dev.vars with SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY, secret names, dotenv package-script pattern"
provides:
  - "01-SPIKES.md: written results for D-22 spikes (a)-(f) plus the assumption-delta no-change decision"
  - "Proven no-session upload paths for Phase 3: uploadToSignedUrl and TUS on <ref>.storage.supabase.co/storage/v1/upload/resumable/sign with x-signature"
  - "Email decision for Phase 2: Resend over fetch; RESEND_API_KEY / MAIL_FROM reserved, not required"
  - "Reproducible spike scripts (tus-signed-upload.mjs, truv-order.mjs) and a generic `pnpm -C app run spike <file>` runner"
  - "docs/app/README.md complete as the operator entry point"
affects: [phase-02-email, phase-02-logics, phase-03-uploads, phase-04-payroll, phase-05-push-to-logics]

actuals:
  tokens: 7000
  tasks: 2
  commits: 7
plan_head_before: f631aeb7d1f3ff0b3c84ac3bbdeb03f52b73d6ee
plan_head_after: 818be31

tech-stack:
  added: []
  patterns:
    - "Spike scripts live under .planning/phases/<phase>/spikes/, import app deps via createRequire(app/package.json), print statuses and key names only"
    - "`pnpm -C app run spike <file>` loads app/.dev.vars with dotenv so no secret file is named in shell text"

key-files:
  created:
    - .planning/phases/01-foundation-staff-sign-in/spikes/tus-signed-upload.mjs
    - .planning/phases/01-foundation-staff-sign-in/spikes/truv-order.mjs
    - .planning/phases/01-foundation-staff-sign-in/01-SPIKES.md
  modified:
    - app/package.json
    - app/.dev.vars.example
    - docs/app/README.md

key-decisions:
  - "Phase 3 uploads (UPL-01) use Worker-minted createSignedUploadUrl tokens with a publishable-key, no-session browser client: uploadToSignedUrl up to 6 MiB, TUS on https://<ref>.storage.supabase.co/storage/v1/upload/resumable/sign with x-signature (6 MiB chunks) above that"
  - "Phase 2 email goes through Resend over fetch; RESEND_API_KEY and MAIL_FROM are reserved names, not in secrets.required, until a key and verified sending domain exist"
  - "Assumption-delta: decision no-change; the 'multiple' signal is the Truv sandbox login multiple.employments; cases.firm_id nullable stays accepted debt"

patterns-established:
  - "Spike evidence: a script under the phase spikes/ dir plus a written result section; never referenced from app code"

requirements-completed: [PLAT-01, PLAT-03]

coverage:
  - id: D1
    description: "Spike (c): signed upload with no session passes on the simple path and the resumable TUS path; bucket and objects deleted"
    requirement: PLAT-03
    verification:
      - kind: integration
        ref: "pnpm -C app run spike ../.planning/phases/01-foundation-staff-sign-in/spikes/tus-signed-upload.mjs -> RESULT simple=PASS resumable=PASS via <ref>.storage.supabase.co"
        status: pass
      - kind: other
        ref: "node app/scripts/db-migrate.mjs --query \"select count(*)::int as n from storage.buckets\" -> n: 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Spikes (a)(b)(d)(e)(f) recorded with results or blockers; assumption-delta no-change; no key-shaped strings in committed docs"
    requirement: PLAT-01
    verification:
      - kind: other
        ref: "Task 2 <verify> grep chain (six headings, decision: no-change, RESEND_API_KEY in .dev.vars.example, README sections, no re_/sb_secret_ strings) -> VERIFY_OK"
        status: pass
    human_judgment: false
  - id: D3
    description: "Spike (e) gated script ran and reported blocked: no Truv keys; prints no values"
    verification:
      - kind: other
        ref: "pnpm -C app run spike ../.planning/phases/01-foundation-staff-sign-in/spikes/truv-order.mjs -> blocked: no Truv keys"
        status: pass
    human_judgment: false
  - id: D4
    description: "Operator README complete; reserved names in app/.dev.vars.example; secrets.required still three names; app check and hygiene green"
    requirement: PLAT-03
    verification:
      - kind: other
        ref: "Task 2 acceptance greps; pnpm -C app run check (151 passed, 52 skipped); bash app/scripts/hygiene-check.sh -> hygiene ok"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-10-11
status: complete
---

# Phase 1 Plan 08: Day-one spikes and operator README Summary

**A browser holding only the publishable key and a Worker-minted token can upload to private Supabase Storage with no session, on both the simple path and resumable TUS (`<ref>.storage.supabase.co/storage/v1/upload/resumable/sign` + `x-signature`). Spikes (a)–(f) are written up in `01-SPIKES.md`, Resend is the Phase 2 email path, and `docs/app/README.md` is complete.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-11T05:25:42Z
- **Completed:** 2026-10-11T05:34:06Z
- **Tasks:** 2/2
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- **Spike (c):**
  - Simple path: PASS. `uploadToSignedUrl` stored 2 MiB with the publishable key, and `getSession()` returned none before the upload.
  - Resumable TUS path: PASS. `POST …/upload/resumable/sign` returned 201. `PATCH` at offset 0 returned 204 with `Upload-Offset` 6291456. `PATCH` at 6291456 returned 204 with `Upload-Offset` 10485760.
  - The `<ref>.storage.supabase.co` host worked first time, so the fallback host was not needed.
  - Cleanup removed the objects and deleted the bucket. The record shows `buckets after cleanup: 0`, and a re-query returned `n: 0`.
- **Spike (e):** `blocked: no Truv keys`. The script ran and printed the exact `wrangler secret put` commands.
- **Spike (a):** PASS, copied from Plan 03.
- **Spike (b):** resolved by research. The project uses `jose` and the JWKS (Plan 06).
- **Spike (d):** blocked by the sending domain, not by the plan tier. The decision is to use Resend.
- **Spike (f):** the questions for Andrew are recorded with exact wording to send.
- **Assumption-delta:** `decision: no-change`. `cases.firm_id` remains accepted debt.
- `app/.dev.vars.example` now reserves `LOGICS_API_KEY` and `LOGICS_SECRET_TOKEN`. The Resend and Truv names were already reserved. `secrets.required` still lists exactly three names.
- The README now has these sections: Deployed URL, Commands (15 scripts), CLI rules (D-08), Secrets (every name set or reserved), Workers plan notes, Checks, Question contract (28 rows), and Spikes.

## Task Commits

1. **Task 1: Spike (c) signed Storage upload** (tracer): `a0fbcbe` (feat). The tracer gate re-ran the verify and it passed.
2. **Task 2: Spikes (a)(b)(d)(e)(f), reserved names, README**: `818be31` (docs)

The ledger range `f631aeb..818be31` holds 7 commits. Two of them are this plan's. The other five belong to concurrent executors (01-06: `22d2ebf`, `ed807a9`; 02-01: `dfbe379`, `3c85532`) and to orchestrator planning docs (`a4a0465`, `992e679`).

## Files Created/Modified

- `.planning/phases/01-foundation-staff-sign-in/spikes/tus-signed-upload.mjs`: spike (c), covering mint, simple upload, raw TUS upload, list, and cleanup.
- `.planning/phases/01-foundation-staff-sign-in/spikes/truv-order.mjs`: spike (e). It is gated on Truv keys and prints the status and `Object.keys` only.
- `.planning/phases/01-foundation-staff-sign-in/01-SPIKES.md`: results for (a)–(f) and the assumption-delta decision.
- `app/package.json`: adds a generic `spike` runner, `dotenv -e .dev.vars -- node`.
- `app/.dev.vars.example`: adds the reserved Logics names.
- `docs/app/README.md`: the finished operator guide.

## Decisions Made

- Phase 3 upload path: use `uploadToSignedUrl` for files up to 6 MiB. Above that, use tus-js-client with exactly 6 MiB chunks against the storage host `/sign` endpoint.
- Email goes through Resend. `RESEND_API_KEY` joins `secrets.required` only in the Phase 2 change that first sends mail.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Spikes run through a package script, not `pnpm exec dotenv -e .dev.vars`**
- **Found during:** Task 1
- **Issue:** The plan's run command names `.dev.vars` in the shell text, and a Bash hook blocks that. The orchestrator note asks for spikes to run through an `app/package.json` script.
- **Fix:** Added a generic `"spike": "dotenv -e .dev.vars -- node"` script. It does not reference the spike files, so the truth "not wired into app/package.json" still holds and threat T-01-40 is unchanged. It is documented in the README Commands section and in the 01-SPIKES.md header.
- **Files modified:** `app/package.json`
- **Verification:** both spikes ran through it, and `grep spikes/ app/package.json` finds nothing.
- **Committed in:** `a0fbcbe`

---

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact on plan:** It changes how the spikes are invoked, not what they do. There was no scope creep.

## Issues Encountered

None. `pnpm -C app run check` passed with 151 tests passing and 52 skipped. `hygiene ok`.

## User Setup Required

USER ACTION REQUIRED items (from the plan output spec):
1. **Resend:** create a Resend account and API key, and verify a sending domain, before Phase 2 (REQ-04). Then set `RESEND_API_KEY` and `MAIL_FROM`.
2. **Truv:** create sandbox keys and run `pnpm -C app wrangler secret put TRUV_CLIENT_ID` and `pnpm -C app wrangler secret put TRUV_SECRET`. Add both names to `app/.dev.vars`, then re-run `pnpm -C app run spike ../.planning/phases/01-foundation-staff-sign-in/spikes/truv-order.mjs`. This must happen before Phase 4.
3. **Workers Paid upgrade:** already done (2026-10-10, CONTEXT D-06 update), so no action is needed.
4. **Andrew's Logics answers:** ask about the key scopes, the `FileCategoryID` list, and the `ActivityType` value. The wording is in 01-SPIKES.md § Spike (f). The answers are needed before Phase 2 ends.
5. **Question count:** confirm whether CLAUDE.md/PROJECT.md "32 questions" should be corrected to 28 (see README § Question contract).

## Next Phase Readiness

Phase 3 can cite 01-SPIKES.md § (c) for the upload design, and Phase 2 can cite § (d) for email. Truv (Phase 4) and the Logics push details (Phase 5) remain gated on the user actions above.

## Self-Check: PASSED

- All 5 key files were found on disk.
- Commits `a0fbcbe` and `818be31` are ancestors of HEAD.
- The Task 1 and Task 2 `<verify>` chains print VERIFY_OK, and the acceptance greps all pass.
- The storage bucket count is 0.
