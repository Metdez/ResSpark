---
phase: 06-address-e-sign
plan: 01
subsystem: client-portal address step (server half) + Phase 6 data/config groundwork
status: complete
tags: [address, smarty, migration, supabase, rpc, worker, secrets]
requires:
  - 0005_connections (Phase 4 CHECKs widened here)
  - clientSession / requireClientHeader / allowInWindow (Phase 2-3)
  - findSessionItem (db/documents.ts), stubVendorFetch, request fixtures
provides:
  - migration 0007_address_esign (13 cases address columns, docuseal/signature/esign CHECK values, case_confirm_address)
  - integrations/smarty/client.ts (suggest, verifyStreet, mapStreetCandidate, smartyConfigured)
  - routes/c-address.ts (GET /api/c/address/suggest, POST /api/c/items/:itemId/address)
  - db/case-address.ts (confirmAddress)
  - src/lib/us-states.ts (US_STATES, isUsStateCode)
  - test fixture seedPortalItems (worker/test/fixtures/portal-items.ts)
  - DOCUSEAL_API_URL / DOCUSEAL_ENV vars; optional DOCUSEAL_* and SMARTY_* secrets; secrets:provider docuseal|smarty
affects: [06-02, 06-03, 06-04, 06-05, 06-08, Phase 7 county standards]
tech-stack:
  added: []
  patterns:
    - plain-fetch vendor client with Basic auth header (no SDK)
    - one SECURITY INVOKER RPC per client write, RAISE tokens mapped in the route
key-files:
  created:
    - supabase/migrations/0007_address_esign.sql
    - app/src/lib/us-states.ts
    - app/worker/src/integrations/smarty/client.ts
    - app/worker/src/db/case-address.ts
    - app/worker/src/routes/c-address.ts
    - app/worker/test/fixtures/portal-items.ts
    - app/worker/test/address-live.test.ts
    - app/worker/src/integrations/smarty/client.test.ts
    - app/worker/src/routes/c-address.test.ts
    - app/src/lib/us-states.test.ts
    - app/worker/test/fixtures/smarty/{autocomplete,autocomplete_units,street_y,street_d,street_empty}.json
  modified:
    - app/worker/src/index.ts
    - app/worker/src/integrations/provider-error.ts
    - app/worker/src/provider-env.d.ts
    - app/wrangler.jsonc
    - app/worker-configuration.d.ts
    - app/.dev.vars.example
    - app/scripts/provision-secrets.mjs
decisions:
  - "Phase 4 CHECK names confirmed in pg_constraint: connections_provider_check, connections_kind_check, consents_kind_check"
  - "ProviderId widened in provider-error.ts (ConnectionProvider | smarty | docuseal), not in db/connections.ts, so PROVIDER_CAPABILITIES and connection rows stay unchanged"
  - "Optional Smarty/DocuSeal secrets typed in worker/src/provider-env.d.ts like Phase 4's vendor keys; secrets.required unchanged"
  - "c-address uses the per-route session_ guard from c-uploads.ts (no use('*')), not a sessionCtx import"
  - "Smarty error threshold is one failure: any ProviderError → 502 and the SPA falls back to manual"
metrics:
  duration: ~45 min
  completed: 2026-10-11
actuals:
  tokens: 21400
  tasks: 3
  commits: 4
plan_head_before: 80b0ac9a10ff77b63f4998857f9de8f863b9dc32
plan_head_after: 1be0a0b02afe2c66b2d92348f78aa38dbc507a68
---

# Phase 6 Plan 01: Address step server half and Phase 6 groundwork Summary

Migration 0007 adds the 13 `cases` address columns, the DocuSeal values on the Phase 4 CHECKs, and the `case_confirm_address` RPC. A plain-fetch Smarty client (Basic auth, `prefer_geolocation=none`, a 32-character cap, `match=invalid`) backs two cookie-session routes with a manual-entry fallback. The live run proves the path from cookie to case columns with Smarty stubbed. The Worker is deployed.

## What was built

- **Migration 0007** was applied with `db-migrate.mjs`; `--dry-run` reports `0 pending`. It adds 13 columns (count verified), 3 widened CHECKs (count verified), and 0 PUBLIC/anon/authenticated grants on `case_confirm_address`. The anon refusal is also proven live with 401/42501. The RPC locks request then item (same order as `upload_complete`), writes blanks as NULL, moves the item forward only to `submitted`, and logs `address.confirmed` with exactly `{source, verified, county_fips, rdi}`.
- **Constraint names found before the drop:** `connections_provider_check` (`plaid,truv,teller`), `connections_kind_check` (`bank,payroll`), `consents_kind_check` (`bank_data,payroll_data`). `connections_status_check` is untouched.
- **Routes:** `GET /api/c/address/suggest` and `POST /api/c/items/:itemId/address`. They share a per-link rate window of 30 calls per minute. When the Smarty keys are missing, suggest and smarty POSTs return 503 while manual POSTs still save the address (unverified, county/FIPS/RDI/DPV all NULL). A US Street `[]` result returns 422 `address_unverifiable` and writes nothing. DPV `D` or `S` sets `needs_unit`. County, FIPS, and RDI are never returned to the phone.
- **Config:** `DOCUSEAL_API_URL` and `DOCUSEAL_ENV=test` are now vars. `secrets:provider docuseal|smarty` reads keys from stdin only and never prints them. An unknown name exits 1 and lists the valid names. The README secrets table has rows for all four keys.

## Measurements

- **POST latency** (live, stubbed Smarty, route plus RPC against the live project): 304 ms on the first run, 267 ms on the second, 648 ms inside the full `test:live` run.
- **Test counts:** `client.test.ts` has 12 tests, `c-address.test.ts` has 19, `us-states.test.ts` has 4, and `address-live.test.ts` has 9 (8 plus the anon refusal). `pnpm -C app test:live` shows 25 files and 320 tests passed. `pnpm -C app run check` passes on the whole tree.
- **Deploy:** ran once with `pnpm -C app run deploy`, version `2b27ee7d-6c83-4bb5-8be6-a135703fbea9`. Both deployed address routes answer 401 `no_session` without a cookie.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 2ce2c80 | migration 0007, Smarty client, address routes, live tracer |
| 2 | 8655986 | unit tests (client, route, states) and live RPC guard matrix |
| 3 | b18cb64 | DocuSeal vars, optional secrets, provider provisioning, README |
| 2 (add) | 0b1b7f3 | live anon refusal of `case_confirm_address` |

The `rev-list ${plan_head_before}..HEAD` range also contains the commits of the other executors sharing this tree (03-05, 04-03, 05-03, 05-04, 07-01). `commits: 4` counts only the `(06-01)` commits in that range.

## Deviations from Plan

### Auto-fixed / adapted

1. **[Rule 3 - Blocking] Optional secrets typed in Task 1, not Task 3.** `smarty/client.ts` needs `env.SMARTY_AUTH_ID` to compile, so the four optional names went into `worker/src/provider-env.d.ts` (the Phase 4 typing location) in commit 2ce2c80. `cf-typegen` in Task 3 emits only the two new vars.
2. **[Rule 1 - Convention] Per-route session guard instead of `.use('*', clientSession)`.** `c-uploads.ts` documents that a `'*'` on an `/api/c` router also matches the portal's paths. `c-address.ts` copies its `session_` guard. Phase 4's `sessionCtx` was neither imported nor copied: `findSessionItem` needs only `request_id`, which comes from `c.var.client`.
3. **[Rule 1 - Bug avoided] RPC tokens matched locally.** `rpcErrorToken` only knows the 0003 tokens, so it would have mapped `item_approved`, `item_not_found`, and `bad_address` to `address_failed`. `db/case-address.ts` matches its own token list, the same way `db/documents.ts` does for `upload_complete`.
4. **Fixture case is fixed and upserted, not deleted.** `events.case_id` has no `ON DELETE` and cases are never deleted, so `seedPortalItems` upserts one "Morgan Lee" case (`...0000e6`) under the test firm. `cleanup()` removes the connections, documents, and request rows (the request delete cascades items, link, sessions, and consents).
5. **Anon refusal test lives in `address-live.test.ts`.** `phase3-anon.test.ts` belongs to Phase 3. `rls.test.ts` needed no change because no table was added.
6. **Usage string.** The plan wrote `secrets:provider -- --provider docuseal`, but the package script already passes `--provider`, so the documented usage is `pnpm -C app secrets:provider docuseal|smarty`.

## Known Stubs

None. The address routes are complete. The Smarty and DocuSeal keys are not provisioned yet (USER ACTION, Plan 08), so the deployed suggest route answers 503 and clients use the manual fallback. That is the designed D-06 behavior.

## Threat Flags

None beyond the plan's threat model. T-06-01 through T-06-05 are mitigated as planned: Basic header only, the 30-per-minute window, the request-scoped item plus the RPC re-check, no street text in events, and revoked grants proven live.

## Notes for later plans

- Plans 02 and 04 can rely on `connections.provider = 'docuseal'`, `kind = 'signature'`, and `consents.kind = 'esign'`.
- `seedPortalItems` supports `kinds: ['signature']` with `signatureTemplate` and `logicsCaseId`.
- The shared index held other executors' staged files (`.claude/skills/...`) during this run. Every 06-01 commit used `git commit -- <paths>`, so none of them were included.

## Self-Check: PASSED

- All created files exist on disk (migration, client, routes, db wrapper, states, fixtures, tests, docs).
- Commits 2ce2c80, 8655986, b18cb64, and 0b1b7f3 are ancestors of HEAD.
