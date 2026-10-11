---
phase: 02-find-the-client-send-the-link
plan: 06
subsystem: ui
tags: [spa, request-link-actions, confirm-dialog, sms-consent, requests-list, dense-table, logics-credentials, settings, tanstack-query, tanstack-router]
status: complete

requires:
  - phase: 02-find-the-client-send-the-link
    provides: "email/regenerate/revoke/consent/list routes (02-04); integrations GET/PUT/test routes (02-03); request page, requests-api, unlessHandled, formatDate, StatusBadge, query-render harness (02-05)"
  - phase: 01-foundation-staff-sign-in
    provides: "ConfirmDialog (house AlertDialog), PasswordInput, useSession role, settings layout and ContentSection, admin chrome, app-wide error handler"
provides:
  - "RequestLinkActions: Email link (truthful result line), Regenerate and Revoke behind confirm dialogs, 409 already-changed notice, SMS consent checkbox"
  - "/admin/requests: dense requests table with count-aware caption, skeletons, empty block + Find a client CTA"
  - "/admin/settings/integrations: IRS Logics credentials card (key hint, fixture notice, Save credentials, Test connection, staff read-only)"
  - "requests-api: emailLink, regenerateLink, revokeLink, recordConsent, listRequests, isEmailResult, isRequestList"
  - "logics-settings-api: isIntegrationStatus, isTestResult, getLogicsStatus, saveLogicsCredentials, testLogicsConnection"
  - "relativeTime(iso, now?) in requests-list-page.tsx"
  - "Nav: sidebar Work -> Requests, Account -> Integrations; settings side-nav Integrations; dashboard CTA Find a client"
affects: [02-08, 03]

actuals:
  tokens: 17200
  tasks: 3
  commits: 13
plan_head_before: 3266702b5de02316ea8b4445dc637193b8af1b5b
plan_head_after: 84b39b8c7a5babd29b64eaf5c994632dc79ecffd

tech-stack:
  added: []
  patterns:
    - "Link actions reuse the house ConfirmDialog (Radix AlertDialog, Cancel focused first, `destructive` prop for the revoke confirm)"
    - "After a write whose response is the new server state (PUT credentials), the cached query is replaced with setQueryData instead of refetched"
    - "Mutations with no variables declare `(_: void)` so `mutate()` type-checks when shared onError/onSettled options are spread in"
    - "Feature pages that need TanStack Link are tested inside a minimal memory router (createRootRoute + createMemoryHistory)"

key-files:
  created:
    - app/src/features/requests/request-link-actions.tsx
    - app/src/features/requests/request-link-actions.test.tsx
    - app/src/features/requests/requests-list-page.tsx
    - app/src/features/requests/requests-list-page.test.tsx
    - app/src/features/settings/integrations/logics-settings-page.tsx
    - app/src/features/settings/integrations/logics-settings-api.ts
    - app/src/features/settings/integrations/logics-settings-page.test.tsx
    - app/src/routes/admin/_shell/requests/index.tsx
    - app/src/routes/admin/_shell/settings/integrations.tsx
    - docs/app/src/features/requests/request-link-actions.md
    - docs/app/src/features/requests/requests-list-page.md
    - docs/app/src/features/settings/integrations/logics-settings-page.md
    - docs/app/src/features/settings/integrations/logics-settings-api.md
    - docs/app/src/routes/admin/_shell/requests/index.md
    - docs/app/src/routes/admin/_shell/settings/integrations.md
  modified:
    - app/src/features/requests/request-page.tsx
    - app/src/features/requests/request-page.test.tsx
    - app/src/features/requests/requests-api.ts
    - app/src/features/settings/index.tsx
    - app/src/features/dashboard/index.tsx
    - app/src/components/layout/data/sidebar-data.ts
    - app/src/routeTree.gen.ts
    - docs/app/src/features/requests/request-page.md
    - docs/app/src/features/requests/requests-api.md
    - docs/app/src/features/settings/index.md
    - docs/app/src/features/dashboard/index.md
    - docs/app/src/components/layout/data/sidebar-data.md

key-decisions:
  - "Regenerate/Revoke dialogs use the house ConfirmDialog (the sign-out dialog's component) instead of re-composing AlertDialog primitives; the revoke confirm is destructive through its `destructive` prop"
  - "The request page prefers the stored link once one exists (a revoked link renders `This link was revoked.`), falling back to the fresh send result only before the post-send refetch, so regenerate/revoke refetches always show the current URL and expiry"
  - "Saving Logics credentials replaces the cached status with the PUT answer (the Worker's last write) and a Test connection result patches last_test_at/last_test_ok, so neither needs a refetch"
  - "relativeTime lives in requests-list-page.tsx (its only caller), Intl.RelativeTimeFormat('en-US', { numeric: 'auto' }) on the largest unit reached (year 365 d, month 30 d, day, hour, minute, second)"
  - "Populated requests-list state (lifted UI-SPEC ⚠ row, for Phase 3 to confirm): dense-table rules and count-aware caption; no filters, sorting, overdue flags, or polling"

requirements-completed: [REQ-03, REQ-04, REQ-05, LOOK-05]

coverage:
  - id: D1
    description: "Email link with a truthful result (sent / not configured / failed) and Emailing… state; Copy link stays primary and still records /copied"
    requirement: "REQ-04"
    human_judgment: false
    verification:
      - kind: test
        ref: "app/src/features/requests/request-link-actions.test.tsx"
        status: pass
      - kind: test
        ref: "app/src/features/requests/request-page.test.tsx#copies the link, records the copy, and confirms with a toast"
        status: pass
  - id: D2
    description: "Regenerate and Revoke behind confirm dialogs (destructive revoke, Cancel focused), 409 already-changed notice with refetch, actions hidden once revoked, revoked line replaces the link"
    requirement: "REQ-03"
    human_judgment: false
    verification:
      - kind: test
        ref: "app/src/features/requests/request-link-actions.test.tsx"
        status: pass
      - kind: test
        ref: "app/src/features/requests/request-page.test.tsx#replaces the link with the revoked line once revoked"
        status: pass
  - id: D3
    description: "SMS consent checkbox posts { agreed: true } once, then stays checked, disabled, and shows Recorded {date}; no text is ever sent"
    requirement: "REQ-05"
    human_judgment: false
    verification:
      - kind: test
        ref: "app/src/features/requests/request-link-actions.test.tsx#records SMS consent once, then locks the checkbox"
        status: pass
  - id: D4
    description: "/admin/requests dense table, count-aware caption, relative times with ISO title, skeleton rows, empty block with Find a client"
    human_judgment: false
    verification:
      - kind: test
        ref: "app/src/features/requests/requests-list-page.test.tsx"
        status: pass
  - id: D5
    description: "IRS Logics credentials card: hint-only status, fixture notice, Save credentials, Test connection results, inline base URL error, staff read-only"
    requirement: "LOOK-05"
    human_judgment: false
    verification:
      - kind: test
        ref: "app/src/features/settings/integrations/logics-settings-page.test.tsx"
        status: pass
  - id: D6
    description: "Navigation: sidebar Requests and Integrations, settings side-nav Integrations, dashboard Find a client CTA"
    human_judgment: false
    verification:
      - kind: command
        ref: "grep -q \"'/admin/requests'\" app/src/components/layout/data/sidebar-data.ts && grep -q 'Find a client' app/src/features/dashboard/index.tsx && pnpm -C app build"
        status: pass
  - id: D7
    description: "Deployed walkthrough signed in: request page actions, /admin/requests table and empty state, /admin/settings/integrations save/test with the notice; a real recipient receiving the link email"
    human_judgment: true
    rationale: "Needs a signed-in staff/admin session in a browser, and real email delivery needs a Resend key and verified domain. Automated evidence: deploy f2b549d6, 200 on the SPA routes, 401 on the unauthenticated API routes, deployed chunks contain the new copy. Consolidated into the Plan 08 end-of-phase human check."

duration: 27 min
completed: 2026-10-11
---

# Phase 2 Plan 06: Link actions, requests list, and Logics credentials Summary

**The rest of the staff surface: email/regenerate/revoke/SMS-consent actions on the request link with truthful results, a dense `/admin/requests` table, and a firm-admin `IRS Logics` credentials card with Save and Test connection.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-10-11T07:57:27Z
- **Completed:** 2026-10-11T08:24:37Z
- **Tasks:** 3 (all TDD: RED commit, then GREEN commit)
- **Files:** 27 created or modified

## Accomplishments

- Request page `Client link` card: `Email link` (`Emailing…`; then `Email sent to {email}`, `Email not configured — copy the link and send it yourself`, or `Email failed — copy the link and send it yourself`), `Regenerate link` and `Revoke link` behind confirm dialogs, the `This link was already changed` notice on a 409, and the SMS consent checkbox that records once and locks. `Copy link` stays the only primary button.
- `/admin/requests` (sidebar **Requests**): client link, status badge, relative `Sent`/`Expires` with ISO `title`, `1 request`/`N requests` caption, three skeleton rows, and the `Nothing to do yet` block with `Find a client`. The dashboard empty block got the same CTA.
- `/admin/settings/integrations` (sidebar and settings side-nav **Integrations**): `Key ending in ••••1234 · Updated Oct 10, 2026` or `No credentials saved`, last test line, `Using built-in test cases` notice in fake mode, `API key`/`Secret token` (show/hide) and `Base URL (optional)`, `Save credentials`, `Test connection` with the success / rejected / unreachable copy, and a read-only view for staff.
- Deployed after `pnpm -C app run check` was green on the whole tree (696 passed, 52 skipped): Worker version `f2b549d6-01d7-4b4a-9119-e71b4a4ee45e`.

## Task Commits

1. **Task 1: Link actions (tracer)** - `5af96f4` (test, RED), `820d727` (feat, GREEN). Tracer gate: auto mode, verify re-run green (29 tests + build), expanded.
2. **Task 2: Requests list, sidebar, dashboard CTA** - `43f3f5f` (test, RED), `3532f14` (feat, GREEN)
3. **Task 3: Logics credentials page** - `33200ce` (test, RED), `84b39b8` (feat, GREEN)

Plan 02-07 ran on the same branch at the same time; `git rev-list` over the ledger range counts 13 commits, 6 of them `(02-06)`.

## Files Created/Modified

See `key-files`. Every created code file has a companion doc under `docs/app/src/...`; tests are documented in their module's doc. All files are under 500 lines (largest new file: `logics-settings-page.tsx`).

## Decisions Made

See `key-decisions`. In short: reuse the house `ConfirmDialog`; the stored link is the source of truth after the first refetch; write responses that carry the new state replace the cache instead of refetching; `relativeTime` sits next to its only caller.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Regenerate or revoke after a send in the same page load would show the stale link**
- **Found during:** Task 1
- **Issue:** 02-05's page preferred `send.data` over the stored link, so after Send then Regenerate the old URL stayed on screen, and after Revoke the old URL came back (a revoked stored link has `url: null`).
- **Fix:** The stored link wins once it exists; a revoked stored link renders `This link was revoked.`; `send.data` is used only before the post-send refetch.
- **Files modified:** `app/src/features/requests/request-page.tsx`
- **Commit:** `820d727`

**2. [Rule 1 - Bug] Invalidating after Save would briefly show the pre-save status**
- **Found during:** Task 3
- **Issue:** The plan said invalidate the status query after save; the PUT already answers with the Worker's last write, and a refetch adds a round trip (and showed stale data in tests whose GET stub is fixed).
- **Fix:** `setQueryData` with the PUT answer; Test connection patches `last_test_at`/`last_test_ok` the same way. Concurrent admins still converge on the next fetch.
- **Commit:** `84b39b8`

### Acceptance greps not met literally (behavior proven by tests)

- `request-link-actions.tsx` does not contain the literal strings `variant="destructive"` or `AlertDialog`. The dialogs use the house `ConfirmDialog` (`components/confirm-dialog.tsx`, a Radix `AlertDialog` with `AlertDialogCancel` first), and the revoke confirm is destructive through its `destructive` prop; the repo's Prettier config also writes JSX attributes with single quotes, so `variant="destructive"` could not appear as written. Tests assert the revoke confirm has the destructive class, the regenerate confirm does not, and focus lands on Cancel.

### Small additions and shape changes

- Error states the plan did not spell out: `Couldn't load requests` and `Couldn't load these settings` (destructive `Alert` with the generic staff copy), and three `Skeleton` bars while the Logics status loads.
- Email `reason: 'no_link'` shows the `Email failed — …` copy; a Test connection failure with a status other than 401/403 shows `Couldn't reach Logics` / `Check the base URL and try again.`
- Settings page description changed from `Choose how the app looks on this device.` to `Choose how the app looks and connect your firm's services.` (the old line was wrong once Integrations exists).
- The settings page title is the settings `ContentSection` heading `Integrations` (same as Appearance), not a second Display title.
- `request-page.test.tsx`'s local `button()` helper gained an optional scope argument.
- The consent checkbox's success colour uses the palette's emerald text (`text-emerald-700 dark:text-emerald-300`) instead of `text-success`, for 4.5:1 contrast at 14 px.

**Total deviations:** 2 auto-fixed (2 bugs), 1 acceptance-grep mismatch by design, plus the small additions above. **Impact:** no scope change; all plan behaviors hold.

## Issues Encountered

- Bash heredocs with some content still fail to parse in this environment (same as 02-05); those files were written with the Write tool.
- Prettier reformatted unrelated lines in `features/dashboard/index.tsx`; the file was restored and only the CTA edit reapplied, to keep the change surgical.

## Follow-ups (not fixed here)

- **Query error double display (01-06/02-05 follow-up):** `main.tsx` is not in this plan's files, so the app-wide `QueryCache` toast still fires alongside the in-page error states on the request page, requests list, and Logics settings page. The fix (a `meta`-aware handler, limited to admin routes) belongs in `main.tsx`.
- `react-refresh/only-export-components` warning on `requests-list-page.tsx` (it exports `relativeTime` beside the component) and on the new route file; warnings only, same as the existing route files.
- A saved custom Logics base URL is not displayed back; re-saving with the field blank resets it to the ValorTax default.

## Known Stubs

None. The 02-05 `RequestLinkActions` slot is filled.

## Threat Flags

None. No new endpoints; the SPA calls only the 02-03/02-04 routes through `api()`. Secrets are never prefilled, are cleared on save, and a test asserts the typed secret is absent from the DOM after save (T-02-29). Staff get a read-only form; the Worker's `requireAdmin` remains the gate (T-02-30).

## User Setup Required

- **USER ACTION (email):** set `RESEND_API_KEY` (and `RESEND_FROM` on a verified domain) as Worker secrets; until then `Email link` truthfully shows `Email not configured — copy the link and send it yourself`.
- **USER ACTION (Logics):** a ValorTax admin pastes the real Logics API key and secret token on `/admin/settings/integrations` and clicks `Test connection`; lookups keep using the built-in test cases until `LOGICS_MODE=live` is set on the Worker.

## Next Phase Readiness

- Plan 02-08's end-of-phase human check: request page actions (email result, regenerate, revoke, consent), `/admin/requests` populated and empty, `/admin/settings/integrations` save/test with the fixture notice, on deployed version `f2b549d6`.
- Phase 3 (STAT-01/02) should confirm the populated-list assumption and add filters, sorting, overdue, and live status to this table or the dashboard.

## Self-Check: PASSED

- All 15 created and 12 modified files exist on disk.
- Commits `5af96f4`, `820d727`, `43f3f5f`, `3532f14`, `33200ce`, `84b39b8` are ancestors of HEAD.
- Plan verification: task verifies green (link actions 15 + request page 14; list 7; settings 12); `pnpm -C app build` green; negative greps (no `dangerouslySetInnerHTML` under `app/src/features`, no `font-medium`/`font-bold` outside `components/ui`) pass; `pnpm -C app run check` exit 0 (696 passed, 52 skipped).
- Acceptance greps: all pass except the two literal strings explained under Deviations.
- Deploy `f2b549d6-01d7-4b4a-9119-e71b4a4ee45e`: `/admin/requests`, `/admin/settings/integrations` 200; `GET /api/admin/requests`, `GET /api/admin/integrations/logics`, `POST .../logics/test` 401 without a session; deployed chunks contain `Email not configured`, `Revoke this link?`, `Only a firm admin can change`, `Find a client`.
