---
phase: 02-find-the-client-send-the-link
verified: 2026-10-11T12:00:00Z
status: human_needed
score: 2/5 roadmap success criteria fully verified (SC2, SC4); SC1, SC3, SC5 verified on every automated clause, with one live or visual clause each left for a human
covered_files: [".planning/phases/02-find-the-client-send-the-link/02-01-PLAN.md", ".planning/phases/02-find-the-client-send-the-link/02-01-SUMMARY.md", ".planning/phases/02-find-the-client-send-the-link/02-02-PLAN.md", ".planning/phases/02-find-the-client-send-the-link/02-02-SUMMARY.md", ".planning/phases/02-find-the-client-send-the-link/02-03-PLAN.md", ".planning/phases/02-find-the-client-send-the-link/02-03-SUMMARY.md", ".planning/phases/02-find-the-client-send-the-link/02-04-PLAN.md", ".planning/phases/02-find-the-client-send-the-link/02-04-SUMMARY.md", ".planning/phases/02-find-the-client-send-the-link/02-05-PLAN.md", ".planning/phases/02-find-the-client-send-the-link/02-05-SUMMARY.md", ".planning/phases/02-find-the-client-send-the-link/02-06-PLAN.md", ".planning/phases/02-find-the-client-send-the-link/02-06-SUMMARY.md", ".planning/phases/02-find-the-client-send-the-link/02-07-PLAN.md", ".planning/phases/02-find-the-client-send-the-link/02-07-SUMMARY.md", ".planning/phases/02-find-the-client-send-the-link/02-08-PLAN.md", ".planning/phases/02-find-the-client-send-the-link/02-08-SUMMARY.md", "app/src/features/client-portal/portal-api.ts", "app/src/features/client-portal/portal-page.tsx", "app/src/features/client-portal/step-list.tsx", "app/src/features/client-portal/use-heartbeat.ts", "app/src/features/lookup/confirm-cards.tsx", "app/src/features/lookup/lookup-page.tsx", "app/src/features/requests/request-builder.tsx", "app/src/features/requests/request-contact-form.tsx", "app/src/features/requests/request-link-actions.tsx", "app/src/features/requests/request-page.tsx", "app/src/features/requests/requests-list-page.tsx", "app/src/features/settings/integrations/logics-settings-page.tsx", "app/src/lib/contact.ts", "app/src/lib/status.ts", "app/worker/src/db/cases.ts", "app/worker/src/db/integrations.ts", "app/worker/src/db/portal.ts", "app/worker/src/db/requests.ts", "app/worker/src/integrations/credential-crypto.ts", "app/worker/src/integrations/email/resend.ts", "app/worker/src/integrations/logics/client.ts", "app/worker/src/integrations/logics/config.ts", "app/worker/src/integrations/logics/fixtures.ts", "app/worker/src/integrations/logics/lookup.ts", "app/worker/src/integrations/logics/mapper.ts", "app/worker/src/middleware/client-session.ts", "app/worker/src/middleware/link-rate-limit.ts", "app/worker/src/routes/admin-integrations.ts", "app/worker/src/routes/admin-lookup.ts", "app/worker/src/routes/admin-request-actions.ts", "app/worker/src/routes/admin-requests.ts", "app/worker/src/routes/client-portal.ts", "supabase/migrations/0003_requests.sql"]
covered_digest: "v3:sha256:50a2b903257ff769d5c963c0a828c5af1dbce7c7589308c39b2b4f8009b20ea8"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Open a fresh client link in a 320 px wide viewport at 200 % browser zoom. Check the intro, tap Start, open a step's View sheet and close it, then close and reopen the link."
    expected: "No horizontal scroll and no text below 16 px. Every tappable element is at least 44 px. Reopening goes straight to the step list."
    why_human: "Layout at a real viewport and zoom level cannot be judged by grep or jsdom. Unit tests assert h-11/min-h-11 classes and no text-sm/text-xs, but not the rendered result."
  - test: "As a signed-in staff user on https://resspark.zh-a16.workers.dev, go Find a client, type (555) 010-0001, confirm a card, build the request, send it, and copy the link. Time it."
    expected: "Two confirm cards appear within 3 s and nothing is preselected. The builder, send, and copy steps all work, and the whole path takes under a minute (SC3)."
    why_human: "Needs a signed-in browser session. The smoke run proves the API path but not the clicks or the elapsed time."
  - test: "Walk the '## Demo script (Phase 2)' in docs/app/README.md end to end (steps 1-12), including the gmial.com suggestion, Email link showing 'Email not configured', the SMS consent tick, and Revoke followed by a phone refresh."
    expected: "Each step behaves as written. After the revoke, the phone shows 'This link isn't active ... Ask your agent for a new link.'"
    why_human: "This is the demo acceptance run across two devices. No automated check covers it."
  - test: "(Needs USER ACTION first: Logics credentials) A firm admin pastes the real Logics API key and secret token in Settings > Integrations, clicks Test connection, sets LOGICS_MODE=live, redeploys, then looks up a real test case by phone, email, and case ID."
    expected: "Test connection reports 'Connected'. Each lookup returns the case's name, phone, email, and status within 3 s, and the phone retry handles Logics' real phone format."
    why_human: "This is a backstop truth (insufficient_spec). The live tenant, the 3-second budget, and the phone header format can only be confirmed with real credentials. The fixture path is the only one measured so far."
  - test: "(Needs USER ACTION first: Resend key and verified domain) Click Email link on a sent request."
    expected: "The recipient receives the email, and the UI shows 'Email sent to {email}'."
    why_human: "This is a backstop truth. Delivery to a real inbox needs RESEND_API_KEY and a verified sending domain. The not_configured branch is the only one measured so far."
---

# Phase 2: Find the Client & Send the Link Verification Report

**Phase Goal:** As a ValorTax case manager, I want to type a phone number, case ID, or email, confirm the matching Logics case, and copy a request link that the client opens on a phone, so that I can get a client started in under a minute while still on the call.
**Verified:** 2026-10-11
**Status:** human_needed
**Re-verification:** No. This is the initial verification.

Scope note: two other executors (03-06 and 04-01) have uncommitted edits in the tree. I judged Phase 2 by its committed files (`git show HEAD:...`). The only Phase 2 files that differ from HEAD are `app/src/lib/status.test.ts` and `app/src/features/client-portal/portal-page.test.tsx`. Both are Phase 3 in-progress test edits, so I ignored them.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin pastes the Logics key and secret and Test connection succeeds (the secret is never shown again). Staff type a case ID, a phone in any format, or an email and see name, phone, email, and status within 3 s. Several matches show as a list, and nothing can be sent before "Is this the right person?" | ? UNCERTAIN (live clause only) | Every automated clause is VERIFIED. `admin-integrations.ts` encrypts with AES-GCM and returns a status DTO without ciphertext (`key_hint` only). `resolveLogicsClient` requires `last_test_ok === true` in live mode. `lookup.ts` normalizes the phone and retries once in the `(###)###-####` form. `confirm-cards.tsx` never auto-confirms. A `cases` row exists only after `/confirm`, which re-reads CaseInfo. 213 worker and 127 web Phase 2 tests pass. The deployed smoke shows `ok lookup 401 without token`, and the recorded `--auth` run shows `ok auth lookup fixture` (2 results). Still open: the live tenant and the 3 s budget, which wait on the Logics credentials USER ACTION (backstop truth). |
| 2 | Staff start from a seeded template, add or remove items, get "did you mean" on gmailcom/gmial.com, and the case is re-fetched from Logics at send time | ✓ VERIFIED | The live DB has `Standard resolution packet` with 5 items and `Documents only` with 3, both global. In `request-builder.tsx` each item can be switched off and relabeled. The shared `app/src/lib/contact.ts` `checkContact` (OSA distance plus the missing-dot case) runs in the SPA form and again in the Worker send route. `admin-request-actions.ts /:id/send` re-reads CaseInfo through `fetchCaseSummary` and refuses with 409 `case_changed` when name, email, or phone changed. |
| 3 | After send: a copyable link that expires (14 days by default) and can be revoked or regenerated without changing the request; email from the app with the delivery result shown; "client agreed to be texted" logged; under a minute end to end | ? UNCERTAIN (timing and real delivery) | Every automated clause is VERIFIED. `request_send` and `request_regenerate_link` set `now() + 14 days`. Regenerate bumps `version` on the same link row, and a unit test shows the old token fails. Revoke sets `revoked_at`, and the URL then reads null. The email route reports `ok`, `not_configured`, `send_failed`, or `no_link`, and the UI copy matches each. `/consent` writes `consent.sms`. Still open: the "under a minute" timing and real email delivery, which need a human and the Resend USER ACTION. |
| 4 | Client opens the link on a phone with no account and sees the firm, the agent, and a step list with done/not-done state. "Opened" only after Start. Reopening resumes. An expired or revoked link says "ask your agent for a new link" | ✓ VERIFIED | `GET /c/:token` sets an HttpOnly signed cookie, redirects to `/c/`, and never touches `opened_at`. `/api/c/start` → `request_open` is the only path that sets opened, and it is idempotent. `PortalPage` shows the intro and Start until `opened_at` is set, then the `StepList` with client chips. A 401 renders `InvalidLinkPage`. `clientSession` re-checks revoked and expired on every call. Behavioral evidence: unit tests, the live `requests-live.test.ts` (10/10, recorded), and the recorded `smoke --client-flow` steps (state `opened_at` null → start → state opened → revoke → state 401 → exchange 404). |
| 5 | Portal is mobile-first with 44 px targets and readable contrast. It sends no-referrer, no-store, and noindex headers, loads no analytics or session replay, and rate-limits token guessing per IP | ? UNCERTAIN (visual clause only) | Headers: `clientPrivacyHeaders` on `/c/*` and `/api/c/*`, plus `secureHeaders` (no-referrer). The smoke run I made shows `ok /c/ headers`, `ok /api/c 401 no_session`. No analytics: a grep finds no gtag, posthog, sentry, or similar, and `index.html` loads only `main.tsx`. Rate limit: `linkRateLimit` keys on `cf-connecting-ip`, uses the `LINK_RATE_LIMITER` binding (20/60 s), and falls back in memory; a test shows the 21st call is 429. Size: `size='xl'` (h-11) and `min-h-11` rows. Still open: the real render at 320 px and 200 % zoom (human). |

**Score:** 2/5 success criteria fully verified. On SC1, SC3, and SC5 every automated clause is verified, and the one remaining clause in each needs a human or a USER ACTION. No truth FAILED. Plan-level must-haves: all non-backstop truths in 02-01..02-08 are backed by passing tests or live checks; the four backstop truths are listed as human items.

### Required Artifacts

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `supabase/migrations/0003_requests.sql` | ✓ VERIFIED | 414 lines. Applied: `--status` lists `0003_requests`. RLS is on for all 5 new tables. The 6 RPCs have `prosecdef=false` and ACL `{postgres, service_role}` only. |
| `app/worker/src/integrations/logics/*` (client, mapper, fixtures, lookup, config) | ✓ VERIFIED | Substantive and imported by the routes. |
| `app/worker/src/routes/admin-{lookup,integrations,requests,request-actions}.ts` | ✓ VERIFIED | Mounted in `index.ts`. |
| `app/worker/src/routes/client-portal.ts`, `middleware/client-session.ts`, `db/portal.ts` | ✓ VERIFIED | Mounted at `/api/c`. |
| `app/src/lib/contact.ts` | ✓ VERIFIED | Imported by both the SPA form and the Worker send route. |
| `app/src/features/{lookup,requests,settings/integrations,client-portal}/*` | ✓ VERIFIED | Routed through `routes/admin/_shell/*` and `routes/c/index.tsx`. The sidebar has Find a client, Requests, and Integrations. |
| Companion docs | ✓ VERIFIED | Every Phase 2 code file I checked has a `docs/` mirror. |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| Lookup page | `/api/admin/lookup` → `lookupCases` → fixture/live client | `lookup-api.ts` `api()` | WIRED |
| Confirm card | `/api/admin/cases/:id/confirm` → CaseInfo → `case_confirm_logics` | `confirmCase` | WIRED |
| Request contact form | `/:id/send` → `checkContact` + CaseInfo re-read + `request_send` + `mintLinkToken` | `requests-api.ts` | WIRED |
| Link actions | `/:id/{email,regenerate,revoke,consent,copied}` | `request-link-actions.tsx` | WIRED |
| Settings → Integrations | `GET/PUT /api/admin/integrations/logics`, `POST /test` | `logics-settings-api.ts` | WIRED |
| `/c/:token` | signed `rs_client` cookie → `clientSession` → `/api/c/state|start|heartbeat` | `portal-api.ts` (same-origin, `X-Requested-With`) | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
| -------- | ---- | ------ | --------- | ------ |
| PortalPage | firm, agent, steps | `getPortalState`: `requests` + `firms!inner` + `request_items`, scoped to the cookie's link | Yes | ✓ FLOWING |
| Lookup cards | case summaries | `resolveLogicsClient` (fixture now, live after USER ACTION) | Fixture only today (by design, `LOGICS_MODE=fake`) | ✓ FLOWING (fixture) |
| Request page link card | url, expires_at | `getRequest` link row, URL minted on each response | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Deployed unauthenticated surface | `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev` | 10/10 ok, including `/c/ headers`, `/api/c 401 no_session`, `/api/c start 401`, `lookup 401 without token` | ✓ PASS |
| Migrations applied | `node app/scripts/db-migrate.mjs --status` | 0002, 0003 (and later phases' 0004, 0005) | ✓ PASS |
| Seeds, RLS, RPC grants | read-only `--query` | 2 global templates (5 and 3 items); RLS true; invoker RPCs, service_role only | ✓ PASS |
| Phase 2 worker tests | `vitest --project worker-node` on the Phase 2 files | 14 files, 213 passed | ✓ PASS |
| Phase 2 web tests | `vitest --project web` on the Phase 2 files | 13 files, 127 passed | ✓ PASS |
| Whole-tree gate | `pnpm -C app run check` | exit 2: `tsc` fails only on `src/lib/status.test.ts` importing `OVERDUE_BADGE`/`documentStatusBadge`, which is Plan 03-06's uncommitted test edit | ? SKIP (not Phase 2; re-run once 03-06 commits) |
| Authenticated client flow | `smoke:auth --client-flow`, `test:live` | Not run (they write to the live DB). The recorded 02-08 results are 18 base + 16 client-flow steps ok, and test:live 234 passed | Recorded evidence |

### Requirements Coverage

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| LOOK-01 | ✓ SATISFIED (fixture); live 3 s is a human item | lookup route, fixture smoke |
| LOOK-02 | ✓ SATISFIED | confirm cards, `/confirm` re-read, case only after confirm |
| LOOK-03 | ✓ SATISFIED | `normalizePhone` + retry, unit tests |
| LOOK-04 | ✓ SATISFIED | `logics_snapshot` cache, send-time `case_changed` |
| LOOK-05 | ✓ SATISFIED (code); live Test connection is a human item | encrypted storage, `key_hint`, `last_test_ok` gate in live mode |
| REQ-01 | ✓ SATISFIED | seeds live, builder toggles and labels |
| REQ-02 | ✓ SATISFIED | shared `checkContact`, server gate, `keep_flagged` |
| REQ-03 | ✓ SATISFIED | HMAC token, 14-day expiry, regenerate/revoke RPCs |
| REQ-04 | ✓ SATISFIED (not_configured path); real delivery is a human item | Resend `fetch`, truthful result copy |
| REQ-05 | ✓ SATISFIED | `consent.sms` event, no SMS sent |
| PORT-01..04, PORT-06 | ✓ SATISFIED | portal routes, `PortalPage`, client-flow smoke |
| PORT-05 | ✓ SATISFIED (headers, no analytics, 44 px classes); zoom render is a human item | see SC5 |

No orphaned requirements: all 16 IDs mapped to Phase 2 are claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `app/worker/src/routes/admin-requests.ts` (`linkUrl`) / `admin-request-actions.ts` (`/:id/email`) | linkUrl | The URL is withheld only when the link is revoked, not when it has expired. After 14 days, staff still see a "copyable" URL, and `Email link` will send a dead link. | ⚠️ Warning | No demo impact (links are minutes old). The client still gets the correct "ask your agent" page. Fix: treat `expires_at <= now` like revoked in `linkUrl`, or show "Expired" plus Regenerate. |
| `app/worker/src/integrations/logics/{client,lookup}.ts` | shortcut comments | CaseInfo unknown-id behavior and the phone header format are unconfirmed | ℹ️ Info | Tracked as questions for Andrew (USER ACTION) |
| `app/worker/src/middleware/link-rate-limit.ts` | shortcut | The heartbeat window is in memory per isolate. The token-guess limiter uses the binding when it is present. | ℹ️ Info | Acceptable for the demo |

No TBD, FIXME, or XXX markers in any Phase 2 file.

### Human Verification Required

1. **Client screens at 320 px / 200 % zoom.** Open a fresh link, check the intro, tap Start, open and close a View sheet, then reopen the link. Expect no horizontal scroll, no text under 16 px, 44 px targets, and that reopening resumes at the list.
2. **Staff click-through.** lookup `(555) 010-0001` → confirm → build → send → copy on the deployed URL. Expect two cards within 3 s, nothing preselected, and under a minute in total.
3. **Demo script.** Walk `docs/app/README.md` "Demo script (Phase 2)" steps 1-12 end to end.
4. **Live Logics (after the USER ACTION).** Test connection succeeds, `LOGICS_MODE=live`, and real lookups by phone, email, and case ID each return within 3 s.
5. **Real email (after the USER ACTION).** Set the Resend key and domain. `Email link` should deliver and show `Email sent to …`.

Known USER ACTIONs (not gaps): Resend key and domain; Logics credentials plus `LOGICS_MODE=live`; Andrew's answers (key scopes, FileCategoryID, ActivityType, CaseInfo unknown-id behavior, phone header format).

### Gaps Summary

No blocking gaps. Every requirement has implementation evidence. Every key link is wired. The deployed unauthenticated smoke passes, the Phase 2 test files pass (340 tests), and the live DB matches the migration contract. What remains is human or live confirmation: the viewport check, the staff click-through and its timing, the demo walk-through, and the two backstop truths that need real Logics and Resend credentials. One non-blocking warning: an expired link is still shown and emailed as if it were active.

---

_Verified: 2026-10-11_
_Verifier: Claude (gsd-verifier)_
