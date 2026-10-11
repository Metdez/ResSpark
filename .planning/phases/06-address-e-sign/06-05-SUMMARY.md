---
phase: 06-address-e-sign
plan: 05
subsystem: api, ui
tags: [docuseal, e-sign, hono, react, settings]
status: complete
requires:
  - phase: 06-address-e-sign
    provides: "06-02: getEsignMapping, DocuSeal client (listTemplates/getTemplate), ESIGN_TEMPLATE_KEYS"
  - phase: 05-push-to-logics
    provides: "05-05: admin-only 403 pattern and settings read-merge-write"
provides:
  - "GET /api/admin/esign/settings, GET/PUT /api/admin/esign/templates"
  - "setEsignMapping (firms.settings.esign_templates merge + settings.esign_templates_updated event)"
  - "E-sign templates card on Settings > Integrations"
  - "Request builder 'Add a form to sign' (mapped keys only)"
  - "POST /api/admin/requests 400 bad_template gate for signature items"
affects: [06-08, request builder, settings]
actuals:
  tokens: 31000
  tasks: 2
  commits: 12
plan_head_before: f8bc4521c28cd1159b2766a88346dbdbbc000801
plan_head_after: b39a8f8e4c331e8e8814f43dfa76d7e0849426f0
key-files:
  created:
    - app/worker/src/routes/admin-esign.ts
    - app/worker/src/routes/admin-esign.test.ts
    - app/worker/test/esign-settings-live.test.ts
    - app/src/features/settings/integrations/esign-api.ts
    - app/src/features/settings/integrations/esign-templates-card.tsx
  modified:
    - app/worker/src/db/esign-settings.ts
    - app/worker/src/index.ts
    - app/worker/src/routes/admin-requests.ts
    - app/src/features/requests/request-builder.tsx
    - app/src/features/settings/integrations/logics-settings-page.tsx
    - app/src/routes/admin/_shell/settings/integrations.tsx
key-decisions:
  - "adminEsignRoute scopes staffAuth to /esign/* (not '*') so it never re-verifies sibling /api/admin routes; mounted after admin-connections, before lookup"
  - "The e-sign card mounts through a new children slot on LogicsSettingsPage, so it sits in the same grid below the Logics and Push settings cards"
  - "Admin gate is server-side only (403 forbidden, shown in the card as 'Only an admin can change these.'); the card does not hide controls from staff"
requirements-completed: []
duration: 30min
completed: 2026-10-11
---

# Phase 6 Plan 05: E-sign template mapping and "Add a form to sign" Summary

An admin maps each allowed form (engagement letter, Form 2848, Form 8821) to a one-signer DocuSeal template in a new Settings card. The request builder offers only the mapped forms. The Worker refuses any other form key both when the mapping is saved and when a request is created, so Form 433-A can't be attached at any point.

## Accomplishments

- `routes/admin-esign.ts`:
  - `GET /esign/settings` returns `{ configured, env, mapping }`.
  - `GET /esign/templates` lists the DocuSeal templates (503 when no key, 502 on a provider error).
  - `PUT /esign/templates` checks, in order: admin, then the key whitelist (`bad_template`), then the values (`bad_request`), then that DocuSeal is configured (503), then `getTemplate` (404 gives `template_not_found`), then exactly one signer (`template_not_single_signer`). Only then does it call `setEsignMapping`.
- `setEsignMapping` reads `firms.settings`, merges into `esign_templates`, and writes it back without touching other keys. It logs `settings.esign_templates_updated` with `{ keys }` (key names only). The read-merge-write is marked `shortcut:`.
- `EsignTemplatesCard`:
  - It has a `Test mode` badge and three labeled selects (`Not set` plus the template names).
  - `Save templates` sends only the keys that changed and shows `Saving…` while it runs.
  - Error copy appears inline for 403, multi-signer and not-found. With no key, the card shows `E-sign not set up`.
- The request builder's `Add a form to sign` dropdown:
  - It lists only the mapped keys, labeled with `ESIGN_TEMPLATE_LABELS`.
  - A key already in the request is disabled.
  - Choosing a key appends `{ kind: 'signature', config: { template } }`.
  - With nothing mapped, or when the settings read fails, the button is disabled and the not-set-up help line shows.
- `POST /api/admin/requests` returns 400 `bad_template` for any `signature` item whose `config.template` isn't one of the three keys.

## Plan output questions

- **Where the card mounts:** on `/admin/settings/integrations`. The route renders `<LogicsSettingsPage><EsignTemplatesCard /></LogicsSettingsPage>`, and the card is the last item in the page grid, below IRS Logics and Push settings.
- **Admin check reused from Phase 5:** the same `role !== 'admin'` → 403 `forbidden` rule as `requireAdmin` in `admin-integrations.ts`, written inline because that helper is not exported.
- **DocuSeal Test Mode listing quirk:** none seen, because there are no DocuSeal keys in this environment. Template listing and lookup are stubbed in the tests. The `shared` parameter is still unverified.

## Task Commits

1. **Task 1 (tracer): mapping routes, setEsignMapping, Settings card**: `d3cdd6c`
2. **Task 2: builder "Add a form to sign" and the bad_template gate**: `2848c7a`

`commits: 12` is measured from the ledger. It includes 10 commits from other executors that landed on `zack` during this run. This plan made 2 task commits plus the final docs commit.

## Verification

- `admin-esign.test.ts`: 20 passed. `admin-requests.test.ts`: 36 passed.
- `esign-api.test.ts` and `esign-templates-card.test.tsx`: 8 passed (6 of them in the card test).
- `request-builder.test.tsx`: 13 passed. All settings tests: 28 passed.
- `esign-settings-live.test.ts` (live, test firm): 1 passed. It was run alone via `test:live:file`, not as part of the full `test:live` suite.
- `pnpm -C app run check` passed on the second run (exit 0; 1645 tests passed; 7 lint warnings, all in other files).
  - The first run had 3 failures in `worker/src/webhooks/docuseal.test.ts`, which belongs to 06-04 and is time-sensitive. This plan didn't touch it.

## Deviations from Plan

1. **[Rule 3 - Blocking] Mount point.** The integrations route rendered only `LogicsSettingsPage`. I added an optional `children` slot to it (2 lines) so the card shares the page layout.
2. **staffAuth scope.** It is `.use('/esign/*', staffAuth)` instead of `'*'`. This follows the codebase rule in `index.ts`: only the lookup route may use `'*'`, otherwise sibling routes verify the token twice.
3. **Extra inline copy.** `template_not_found` shows `DocuSeal couldn't find that template. Reload the page and pick again.` The plan gave no copy for it.

## Known Stubs

None.

## Self-Check: PASSED

- Files exist: `admin-esign.ts`, `esign-templates-card.tsx`, `esign-api.ts`, `esign-settings-live.test.ts`.
- Commits `d3cdd6c` and `2848c7a` are ancestors of HEAD.
