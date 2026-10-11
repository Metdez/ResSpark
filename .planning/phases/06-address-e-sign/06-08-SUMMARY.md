---
phase: 06-address-e-sign
plan: 08
subsystem: ops
status: complete
tags: [smoke, docuseal, smarty, runbooks, e-sign, anvil]
requires: [06-04, 06-05, 06-06, 06-07]
provides: ["smoke.mjs --esign-flow (smoke-esign.mjs)", "ok webhooks docuseal 401", "pnpm smoke:esign", "worker/test/docuseal-contract.test.ts", "README Demo script + USER ACTION (Phase 6)", "runbooks/docuseal-test-mode.md", "runbooks/esign-phone-check.md"]
affects: [app/scripts/smoke-connect.mjs]
tech-stack:
  added: []
  patterns: ["deployed smoke split per flow (smoke-connect.mjs, smoke-esign.mjs) to keep smoke.mjs under 500 lines"]
key-files:
  created: [app/scripts/smoke-esign.mjs, app/worker/test/docuseal-contract.test.ts, docs/app/scripts/smoke-esign.md, docs/app/worker/test/docuseal-contract.test.md, docs/app/runbooks/docuseal-test-mode.md, docs/app/runbooks/esign-phone-check.md]
  modified: [app/scripts/smoke.mjs, app/scripts/smoke-connect.mjs, app/package.json, docs/app/scripts/smoke.md, docs/app/scripts/smoke-connect.md, docs/app/package.md, docs/app/README.md]
decisions:
  - "--esign-flow lives in app/scripts/smoke-esign.mjs; smoke.mjs is at 491 lines"
  - "The esign smoke reuses smoke-connect's consentVersion reader (now exported) instead of hard-coding esign-v1"
  - "The ?step= deep-link check runs last in the esign flow because it exchanges the link a second time"
  - "D-09 closed on paper: DocuSeal stays; no Anvil code or dependency"
requirements-completed: [ADDR-01, SIGN-01, SIGN-02, SIGN-03, SIGN-04]
metrics:
  duration: 35min
  completed: 2026-10-11
actuals:
  tokens: 11000
  tasks: 2
  commits: 5
plan_head_before: 23a82cc171fb9c22b68bc638aa9e78dda321cad4
plan_head_after: 4496af5a26a936659f4af26558080a952f442eeb
---

# Phase 6 Plan 08: E-sign deployed smoke, operator docs and Anvil evaluation Summary

**`smoke --esign-flow` proves the address step, ESIGN consent, signing start, the `/c/sign` DocuSeal CSP and the `?step=` signing link on the deployed Worker in no-keys mode. The base smoke proves `ok webhooks docuseal 401`. The README has the Phase 6 demo script and USER ACTION list, two runbooks were added, there is an opt-in DocuSeal Test Mode contract test, and the Anvil comparison is written below.**

`commits: 5` is the ledger count. 3 of those commits belong to 07-10, which committed on `zack` in the same window. This plan made 2 commits: `e619e4c` and `4496af5`.

## Results

- **Deployed URL host:** `resspark.zh-a16.workers.dev`. The current deploy is from `8822a38`. This plan changed only scripts, docs and one opt-in test, so nothing needs redeploying for the Worker. The smoke ran from the working tree against that deploy.
- **Plain smoke:** 14 ok, 0 FAIL, including `ok webhooks docuseal 401`.
- **`pnpm -C app smoke:esign https://resspark.zh-a16.workers.dev`:** all client-flow steps passed, and then:
  - `ok esign-flow items`
  - `ok esign-flow address suggest (smarty: no)`
  - `ok esign-flow address save (verified: no)`
  - `ok esign-flow admin review address + 1 signature`
  - `ok esign-flow consent esign`
  - `ok esign-flow signature start 503 provider_not_configured`
  - `ok esign-flow sign csp`
  - `ok esign-flow step link 302`
  - then revoke / revoke 401 / exchange 404
- **Mode line:** `ok esign-flow complete (keys: smarty no, docuseal no)`.
- **DocuSeal contract test:** did not run, because there is no `DOCUSEAL_API_KEY` or `DOCUSEAL_CONTRACT_TEMPLATE_ID`. It is reported as skipped, and with `--reporter=verbose` the reason prints. A3 (the ISO `expire_at` and the real array response) is therefore still unverified live. Once a key exists, the USER ACTION list has the command that checks it.
- **A2 (does Test Mode fire webhooks):** no live signing happened, so there is no observation yet. `docuseal-test-mode.md` §6 explains how to check: look for `webhook_events` rows with `provider = 'docuseal'`.
- **Gates:**
  - `pnpm -C app run check`: exit 0, with 160 files passed and 35 skipped, and 1944 tests passed. Lint had 0 errors and 9 warnings, none of them in this plan's files.
  - `pnpm -C app test:e2e`: 7 of 7 passed.
  - `pnpm -C app test:live`, run serially (`--no-file-parallelism --test-timeout=30000 --hook-timeout=60000`): 42 files passed and 1 skipped (the contract test); 417 tests passed. The default parallel run hit 5 s timeouts while two executors were loading Supabase. That matches what 04-07 reported.

## Anvil evaluation (D-09)

This was time-boxed. No Anvil developer key was shared, so the evaluation comes from Anvil's public Etch e-sign docs (useanvil.com/docs/api/e-signatures, read 2026-10-11) and not from a hands-on Playwright run. No Anvil package, code or route entered the repo. The DocuSeal numbers come from Plan 06-06's Playwright run at 390×844.

| Criterion | DocuSeal (measured, 06-06) | Anvil Etch (from docs, not measured) |
|---|---|---|
| Tap count to first signature field | Fresh link: 3 (`Start`, `Sign`, `I agree`). Copied signing link: 2 (`Start`, `I agree`). | Estimated at least 4 from a fresh link. Anvil's signing page has its own consent/"Sign documents" step (`signConsentText`, `signButtonText`) after our ESIGN consent, unless we drop ours. The default `signatureMode` is `draw`; `text` mode still asks the signer to accept the signature at each box. |
| Zoom | None. Inputs are forced to 16 px through `customCss` inside the shadow DOM. | Not measurable without a key. The page is Anvil-hosted inside an iframe, and we cannot inject CSS to force 16 px inputs unless we pay for the custom-stylesheet tier. |
| Sideways scroll | None after any tap (390×844). | Not measured. The signing UI renders the PDF pages, and the docs make no mobile-reflow claim. |
| White-label | Firm-neutral by default. Test Mode shows a "Developer Sandbox" banner that a production key removes. CSS is injectable for free (`customCss`). | Logo (≤30 px high) and colors/strings through `signaturePageOptions`. A custom stylesheet needs the Product pack or Enterprise plan. Test packets (`isTest`) are watermarked with red signatures. |
| Embedding / CSP | A web component (`form.js`) with no iframe. CSP needs `cdn.docuseal.com` and `docuseal.com` only. | An iframe (`AnvilEmbedFrame`, `generateEtchSignUrl`), so it needs a `frame-src` entry. Production embedding must be enabled per organization, with domains on an allow list. Dev-key and `isTest` packets embed anywhere. |
| Emails | `send_email` / `send_sms` false, and the send-copy button is off. Account notifications are a USER ACTION. | `enableEmails: false` per signer, and `signerType: 'embedded'` suppresses the invite. |

**Verdict:** DocuSeal stays. On paper, Anvil has no tap, zoom or scroll advantage. It adds an iframe origin, and it gates white-label CSS behind a paid tier. If Andrew still prefers Anvil, the comparison should be re-run hands-on with a dev key (USER ACTION 5). The D-08 module boundary (`integrations/esign/`) keeps a swap cheap.

## Pending for the orchestrator

- **No deploy needed for this plan.** It changed no Worker or SPA code. If the orchestrator redeploys anyway (`pnpm -C app run deploy:snapshot`), re-run `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev` (expect `ok webhooks docuseal 401`) and `pnpm -C app smoke:esign https://resspark.zh-a16.workers.dev` (expect `ok esign-flow complete (keys: smarty no, docuseal no)`).

## Human checks (end-of-phase UAT, backstop)

- **Real iPhone Safari and Android Chrome**, using `docs/app/runbooks/esign-phone-check.md`. The copied signing link must take at most 2 taps and a fresh link at most 3. Focusing the input must not zoom, and nothing may scroll sideways. Staff must see `Signed` with both PDFs within seconds. There must be no CSP violation in the desktop console. **This needs DocuSeal Test Mode keys first.**
- **The live Smarty address on a phone:** suggestions appear after 3 characters, the address is USPS-standardized, the staff card shows county, FIPS and RDI, and the client is never asked for a county. **This needs the Smarty keys.**

## Deviations from Plan

1. **[CLAUDE.md 500-line rule] New module `app/scripts/smoke-esign.mjs`** (94 lines), following the `smoke-connect.mjs` pattern. `smoke.mjs` is now 491 lines. Because of this, these plan greps match `smoke-esign.mjs` rather than `smoke.mjs`: `/api/c/address/suggest`, `signature/start`, `cdn.docuseal.com` and `?step=`. `esign-v1` is not hard-coded. The version is read from `consent-text.ts` through `consentVersion`, which is now exported from `smoke-connect.mjs` (a one-word change).
2. **[Rule 3 - Blocking] The test firm's Logics `write_enabled` was left `true`** by an earlier parallel `test:live` run whose `afterAll` timed out. That made `logics-push.test.ts` fail all five of its toggle-dependent tests. I reset it to `false` for the **test firm only** (`…000e`) with a scratchpad script run through `pnpm -C app run spike`, which printed booleans only. After that, `logics-push.test.ts` passed 9 of 9 and the full serial `test:live` was green. No repo change.
3. **No deploy** (coordinator rule). The smoke ran against the existing `8822a38` deploy, which already serves every route this plan checks.
4. **The plan's verify used the default parallel `test:live`.** On this shared tree it times out under load, so the gate was met with the serial invocation. Same as 04-07.

## Known Stubs

None. Without keys, the no-keys states are the designed D-06 and D-10 fallbacks.

## Threat Flags

None. No new routes. The smoke prints ids, codes and mode flags only (T-06-30), and the contract test prints ids and statuses only.

## Self-Check: PASSED

- FOUND: app/scripts/smoke-esign.mjs, app/worker/test/docuseal-contract.test.ts, docs/app/scripts/smoke-esign.md, docs/app/worker/test/docuseal-contract.test.md, docs/app/runbooks/docuseal-test-mode.md, docs/app/runbooks/esign-phone-check.md
- FOUND commits: e619e4c, 4496af5 (ancestors of HEAD)
