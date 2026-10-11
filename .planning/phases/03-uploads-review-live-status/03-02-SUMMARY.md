---
phase: 03-uploads-review-live-status
plan: 02
subsystem: ui
tags: [react, uploads, tus, supabase-storage, heic, canvas, web-crypto, client-portal]

requires:
  - phase: 03-uploads-review-live-status
    provides: "03-01 upload routes (mint, complete, token re-mint, item documents list); 03-06 status labels"
  - phase: 01-foundation-staff-sign-in
    provides: "Spike (c): resumable TUS PASS on <ref>.storage.supabase.co with x-signature, 6 MiB chunks"
  - phase: 02-find-the-client-send-the-link
    provides: "portalFetch, StepList, StatusBadge, client sheet conventions, heartbeat lastStep"
provides:
  - "app/src/features/uploads/*: acceptFile, preprocess (Canvas resize, lazy HEIC), sha256Hex, typed upload api, TUS/PUT transport with rs_pending_uploads, copy map, FileRow, UploadSheet"
  - "StepList opens UploadSheet for upload steps and refreshes ['portal','state'] on close"
affects: [03-03 staff review (rejected items return with the note), 03-05, 03-07, 05 Logics push (sha256 recorded per document)]

actuals:
  tokens: 19000
  tasks: 3
  commits: 24
plan_head_before: 0fb51e86f8739801381a231406e1e3409092dd08
plan_head_after: e4721c05c046d1f96a4032468527da1ed2710616

tech-stack:
  added: ["heic2any 0.0.4 (MIT, lazy chunk)", "tus-js-client 4.3.1 (MIT, lazy chunk)"]
  patterns:
    - "Client upload: acceptFile -> preprocess -> sha256Hex -> mint (or re-mint from rs_pending_uploads) -> uploadBlob -> complete, per file under Promise.allSettled"
    - "Large client-only libraries are loaded with dynamic import() inside the branch that needs them"

key-files:
  created:
    - app/src/features/uploads/accept.ts
    - app/src/features/uploads/accept.test.ts
    - app/src/features/uploads/preprocess.ts
    - app/src/features/uploads/preprocess.test.ts
    - app/src/features/uploads/api.ts
    - app/src/features/uploads/api.test.ts
    - app/src/features/uploads/copy.ts
    - app/src/features/uploads/transport.ts
    - app/src/features/uploads/transport.test.ts
    - app/src/features/uploads/file-row.tsx
    - app/src/features/uploads/upload-sheet.tsx
    - app/src/features/uploads/upload-sheet.test.tsx
    - docs/app/src/features/uploads/accept.md
    - docs/app/src/features/uploads/preprocess.md
    - docs/app/src/features/uploads/api.md
    - docs/app/src/features/uploads/copy.md
    - docs/app/src/features/uploads/transport.md
    - docs/app/src/features/uploads/file-row.md
    - docs/app/src/features/uploads/upload-sheet.md
  modified:
    - app/package.json
    - pnpm-lock.yaml
    - app/LICENSES.md
    - app/src/features/client-portal/step-list.tsx
    - app/src/features/client-portal/step-list.test.tsx
    - docs/app/src/features/client-portal/step-list.md

key-decisions:
  - "Transport is TUS: 01-SPIKES.md Spike (c) 'Result: PASS (simple path uploadToSignedUrl) / PASS (resumable TUS via /storage/v1/upload/resumable/sign)'; endpoint derived as <ref>.storage.supabase.co; tus-js-client 4.3.1 installed"
  - "The pending map (rs_pending_uploads) and token re-mint run for both transports, so a retried file reuses its document instead of leaving an orphan uploading row that counts toward the 10-file cap"
  - "A Storage 4xx (upload_failed) clears the pending entry so the next try mints a new document; network errors keep it so tus can resume"
  - "The repo has no vendored shadcn Progress; FileRow uses a two-div role=progressbar bar instead of adding a component"
  - "The sheet has a 44 px Close next to Done (Done stays disabled until a file is ready), matching ComingNextSheet's hidden 16 px icon close"

patterns-established:
  - "features/uploads/** follows the /c/* import rule: portalFetch only, no @/lib/api, @/lib/supabase or @/components/layout"

requirements-completed: [UPL-01, UPL-02]

coverage:
  - id: D1
    description: "Accept rules (PDF/JPG/PNG/HEIC by extension then type, empty refusal), Canvas resize to 2,000 px JPEG 0.82, lazy heic2any, heic_failed, SHA-256"
    requirement: UPL-02
    verification:
      - kind: unit
        ref: "app/src/features/uploads/accept.test.ts, app/src/features/uploads/preprocess.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Typed upload API through portalFetch with guards; error codes map to plain sentences"
    requirement: UPL-01
    verification:
      - kind: unit
        ref: "app/src/features/uploads/api.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "TUS transport per spike (c) with resume, PUT fallback with 3 attempts, failure-safe pending map"
    requirement: UPL-01
    verification:
      - kind: unit
        ref: "app/src/features/uploads/transport.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Upload sheet: controls, parallel independent uploads, refusals, rejected/approved states, prior files in order, Done; StepList opens it for upload steps"
    requirement: UPL-01
    verification:
      - kind: unit
        ref: "app/src/features/uploads/upload-sheet.test.tsx, app/src/features/client-portal/step-list.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real phone: photo + synthetic PDF reach 'Sent to your agent', reload lists them, .txt refused, HEIC > 6 MB uploads as JPEG, 30 MB PDF refused; live TUS resume against Storage"
    requirement: UPL-01
    human_judgment: true
    rationale: "Needs a phone (or device emulation) on a live client link; not run by the executor. End-of-phase human check."

duration: 3h 08m wall clock (two session restarts; about 60 min of active work)
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 02: Client upload step Summary

**Clients can now add files to an upload step from their phone. Each file is checked for type, shrunk on a canvas (HEIC is converted by a lazily loaded `heic2any`), hashed with SHA-256, and sent straight to Supabase Storage over resumable TUS (`tus-js-client`, `x-signature`, 6 MiB chunks), the transport Spike (c) proved. Each file shows its own progress and outcome, rejected items show the agent's note with `Upload again`, and the Phase 2 step list opens this sheet for `upload` steps. Deployed as version `7f94e789-2a03-42da-96a0-da98436fe53e`.**

## Performance

- **Duration:** started 2026-10-11T09:36:58Z, finished 12:45Z. The session restarted twice in between; active work was about 60 minutes.
- **Tasks:** 3 (all TDD-flagged)
- **Files:** 25 (19 created, 6 modified)

## Accomplishments

- `accept.ts` refuses anything except PDF/JPG/PNG/HEIC before any network call. It checks the extension first, because iOS often sends PDFs with an empty type. A 0-byte file is refused as empty.
- `preprocess.ts` resizes photos to a 2,000 px long edge and re-encodes them as JPEG 0.82 with the Canvas API. It paints a white background so transparent PNG pixels do not turn black. HEIC goes through `await import('heic2any')`, and a failed conversion is reported as `heic_failed` instead of being uploaded. PDFs pass through untouched. `sha256Hex` uses Web Crypto.
- `transport.ts` uses TUS. The endpoint is `<ref>.storage.supabase.co/storage/v1/upload/resumable/sign`. The fingerprint is `rs-<document_id>`, so a reload can resume the upload. The PUT fallback (3 attempts with 1 s and 3 s waits, no retry on a 4xx) is implemented and tested as well. `rs_pending_uploads` survives private mode and corrupt JSON.
- `upload-sheet.tsx` has a 56 px camera control and a 44 px `Choose from files` control (the second has no `capture`, so iOS can reach the photo library and PDFs). Files upload in parallel under `allSettled`. Rows move through `Preparing…`, `Uploading… N%`, `Checking…` and `Sent to your agent`. The 25 MB cap is applied to the processed file. Errors read as plain sentences, with `Try again` or `Remove`. Closing the sheet aborts in-flight uploads. Rejected and approved items read their state and note from `GET /api/c/items/:id/documents`.
- `StepList` opens `UploadSheet` for `upload` steps and invalidates `['portal','state']` on close. The chip labels still come from `lib/status.ts`, and the sheet sends no heartbeat of its own.

## Task Commits

1. **Task 1 RED:** `55d653b` (test). Accept and preprocess tests.
2. **Task 1 GREEN:** `ebe6f00` (feat). accept, preprocess, api (plus `api.test.ts`), copy, `heic2any`, and docs.
3. **Task 2 RED:** `dda8bd4` (test). Transport and pending-map tests.
4. **Task 2 GREEN:** `7f37db9` (feat). The TUS and PUT transport, `tus-js-client`, and the LICENSES entries.
5. **Task 3:** `0cdc4c1` (feat). FileRow, UploadSheet, the StepList wiring, tests and docs.
6. **Docs:** `591a767`. The `close` copy row.

`commits: 24` is the measured `rev-list` count from `plan_head_before` to `plan_head_after` on the shared `zack` branch. This plan made the 6 commits above; the other 18 belong to 03-03, 03-04, 04-02 and 05-01.

## Recorded facts (requested by the plan's output section)

- **Transport branch:** `tus`. It comes from the 01-SPIKES.md Spike (c) line `Result: PASS (simple path uploadToSignedUrl) / PASS (resumable TUS via /storage/v1/upload/resumable/sign)`, with the endpoint `https://<ref>.storage.supabase.co/...` that worked on the first try.
- **`tus-js-client` installed:** yes, 4.3.1 pinned exactly, MIT, verified with `pnpm view`. It is recorded in `app/LICENSES.md` next to `heic2any` 0.0.4. Both were installed through `pnpm -C app add --save-exact`, and the root `pnpm-lock.yaml` is the only lockfile.
- **`/c/*` bundle:** after this plan, the `c` route chunk is 18.8 kB (7.1 kB gzip) and includes the whole uploads feature. `tus-js-client` is a separate lazy chunk (`browser-*.js`, 60 kB, 15.5 kB gzip) that loads on the first upload. `heic2any` is a separate lazy chunk (1.35 MB, 345 kB gzip) that loads only when a HEIC file is picked. The entry chunk does not contain either library. The pre-plan size of the `c` chunk was not measured, so there is no exact delta; the added uploads source is about 4–5 kB gzip.
- **Phone-check outcomes:** not run. The real-phone checks (photo plus synthetic PDF, reload listing, `.txt` refusal, HEIC larger than 6 MB, 30 MB PDF) are left for the end-of-phase human check. See the D5 coverage entry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The Phase 2 test "Close hides the sheet" opened the upload step**
- **Found during:** Task 3
- **Issue:** The test clicked `View` on `Upload your ID` and expected `Coming next`. Upload steps now open `UploadSheet`.
- **Fix:** The test now clicks `View` on `Connect your bank`. Its assertions are unchanged.
- **Files modified:** `app/src/features/client-portal/step-list.test.tsx`
- **Commit:** `0cdc4c1`

**2. [Rule 2 - Missing critical] `errorCopy` looked codes up on a plain object**
- **Issue:** `ERRORS[code] ?? …` would return `Object.prototype` members for codes such as `toString`.
- **Fix:** The lookup now uses `hasOwnProperty`, with a test for it.
- **Commit:** `ebe6f00`

**3. [Rule 2 - Missing critical] White background before the JPEG re-encode**
- **Issue:** Transparent PNG areas become black when re-encoded as JPEG, which would make some scans unreadable.
- **Fix:** `draw()` fills the canvas white before drawing the image.
- **Commit:** `ebe6f00`

**4. [Rule 3 - Blocking] No vendored `Progress` component**
- **Issue:** The plan named `components/ui/progress.tsx`, but it is not in the repo.
- **Fix:** A two-div `role="progressbar"` bar inside `FileRow`. No new component or dependency.
- **Commit:** `0cdc4c1`

**5. [Scope] Pending map used on both transports, and a `Close` button added**
- The plan scoped the re-mint lookup to the TUS branch. Running it on both transports avoids orphan `uploading` rows on the PUT branch, at the same cost.
- The sheet also gained a 44 px `Close` (copy key `close`), because `Done` is disabled until a file lands and the 16 px icon close is hidden by the Phase 2 convention.
- **Commit:** `0cdc4c1`

**6. [Process] Task 3 was not split into a RED commit**
- Task 3's tests and code landed together in `0cdc4c1`. Tasks 1 and 2 have separate RED commits; their RED runs failed because `./accept`, `./preprocess` and `./transport` did not exist yet. That is a module-missing RED, not an assertion-level one, and no `tdd-red-evidence` record was produced.

**Total deviations:** 4 auto-fixed (2 missing-critical, 2 blocking), 1 scope, 1 process. **Impact:** no API or contract change. The added items are a background fill, a safe lookup, a Close button, and the pending map on both transports.

## Issues Encountered

- The session restarted twice mid-plan. The commits already made survived, and no work was lost.
- The first full `pnpm -C app run check` failed only in 03-04's in-progress `features/dashboard/*` files (router types and `.at()`). After 03-04 committed `32afe29`, `check` passed on the whole tree: 72 files and 997 tests passed, 12 files and 120 tests skipped, 0 lint errors (7 warnings, none in this plan's files). The single deploy ran after that.
- Vite warns that the `heic2any` chunk is larger than 500 kB. This is expected: the chunk is lazy and loads only for HEIC files.

## Verification

- `pnpm -C app exec vitest run --project web src/features/uploads src/features/client-portal`: 9 files, 74 tests passed.
- `pnpm -C app run check`: exit 0, which includes the file-size gate, `tsc -b`, eslint and all tests.
- `grep -rE "@/lib/api|@/lib/supabase|@/components/layout" app/src/features/uploads` prints nothing.
- The deploy (`pnpm -C app run deploy`) produced version `7f94e789-2a03-42da-96a0-da98436fe53e`. Probes against it:
  - The deployed `c` chunk contains `upload/resumable/sign`, the project's Supabase URL and the publishable key.
  - `POST /api/c/items/<uuid>/uploads` without a cookie returns 401.
- `upload-sheet.tsx` is 287 lines; the largest file in `features/uploads` is `transport.test.ts` at 259 lines.

## Known Stubs

None.

## Threat Flags

None. The only new trust boundary is browser → Storage over TUS, and it is already in the plan's threat model.

## Next Phase Readiness

- 03-03's reject flow puts `rejection_note` on the item. The sheet already shows it, along with `Upload again` and `Needs a new copy`. UPL-03 stays open until 03-03 finishes.
- End-of-phase human check: a phone upload of a photo and a PDF, the listing after a reload, a `.txt` refusal, a HEIC larger than 6 MB, a 30 MB PDF, and a TUS resume after a reload in the middle of an upload.

## Self-Check: PASSED

- All 19 created files exist on disk.
- Commits `55d653b`, `ebe6f00`, `dda8bd4`, `7f37db9`, `0cdc4c1` and `591a767` are ancestors of HEAD.
- Acceptance greps re-run and passed:
  - `MAX_EDGE = 2000`, `JPEG_QUALITY = 0.82`, `await import('heic2any')`, `createImageBitmap(`, `'SHA-256'` and `shortcut:` are present, with no static heic2any import.
  - `x-signature`, `upload/resumable/sign`, `chunkSize: 6 * 1024 * 1024`, `removeFingerprintOnSuccess: true`, `rs_pending_uploads`, `XMLHttpRequest`, `[1000, 3000, 5000]` and the `01-SPIKES.md` comment are present.
  - `accept=`, `capture=`, `multiple`, `listItemDocuments(`, `allSettled` and `h-14` are present.
  - `step-list.tsx` contains `UploadSheet` and `'upload'`.
- The plan's literal `accept="image/*,.pdf,.heic,.heif"` and `capture="environment"` are written `accept={ACCEPT}` (where `ACCEPT = 'image/*,.pdf,.heic,.heif'`) and `capture='environment'`, because the repo's Prettier uses single JSX quotes. The rendered attributes are asserted in `upload-sheet.test.tsx`.
