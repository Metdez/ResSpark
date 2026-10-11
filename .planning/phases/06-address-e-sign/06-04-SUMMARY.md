---
phase: 06-address-e-sign
plan: 04
subsystem: worker/esign
status: complete
tags: [docuseal, webhook, hmac, reconcile, storage, logics-push]
requires: [06-02, 04-01, 04-03, 05-05]
provides: [docusealAdapter, reconcileSignature, ingestSignedArtifacts, signDocuseal]
affects: [webhooks route, queue consumer, 15-minute cron sweep, Phase 5 push]
tech-stack:
  added: []
  patterns: [crypto.subtle.verify HMAC, re-read-never-trust reconcile, deterministic storage keys]
key-files:
  created:
    - app/worker/src/webhooks/docuseal.ts
    - app/worker/src/jobs/signature-reconcile.ts
    - app/worker/src/integrations/esign/ingest.ts
    - app/worker/test/helpers/docuseal-sign.ts
    - app/worker/test/esign-complete.test.ts
    - app/worker/test/esign-reconcile-live.test.ts
    - app/worker/src/webhooks/docuseal.test.ts
    - app/worker/src/integrations/esign/ingest.test.ts
  modified:
    - app/worker/src/webhooks/types.ts
    - app/worker/src/webhooks/adapters.ts
    - app/worker/src/jobs/index.ts
    - app/worker/src/jobs/reconcile.ts
    - app/worker/src/storage/connection-files.ts
    - app/worker/src/db/connections-ops.ts
    - app/worker/test/connections-tracer.test.ts
decisions:
  - "DocuSeal events route by data.submission_id; an unknown submission marks the ledger row ignored"
  - "form.viewed/form.started only log esign.viewed/esign.started; status changes only after GET /submissions/{id}"
  - "Completed without documents or audit log throws transient artifacts_not_ready so the queue retries"
  - "storeProviderFile needed only the kind union widened to 'signature'; signed files live at signature/{submission_id}/"
  - "Cron batch size stays Phase 4's 50; signatures heal through the kind-agnostic stale sweep"
metrics:
  duration: 35m
  completed: 2026-10-11
actuals:
  tokens: 19650
  tasks: 3
  commits: 3
plan_head_before: eeec570378a2f640998605aecd7bf9638025a01d
plan_head_after: 7c8089d
---

# Phase 6 Plan 04: DocuSeal completion webhook and signed-PDF ingest Summary

When a client finishes signing, a DocuSeal `form.completed` webhook now lands the signed PDF and the audit-trail PDF in the case with a sha256 hash, marks the item `submitted`, and the signed PDF can be pushed to Logics like any other document. The webhook is checked with an HMAC over the raw body, and the status always comes from re-reading `GET /submissions/{id}`, never from the webhook payload.

## What was built

- `webhooks/docuseal.ts`: checks `X-Docuseal-Signature` (`ts.hex`) with `crypto.subtle.verify`, allows a ±300 s window, parses JSON only after the check passes, and accepts only `form.*` events. The event key is `event_type:data.id:timestamp`. It is registered as `docuseal: docusealAdapter`.
- `jobs/signature-reconcile.ts`: a `done` or `removed` connection makes no DocuSeal call. A viewed or started event only writes a log row. A `completed` submission triggers the ingest, then `done`. If it is completed but the files are missing, it throws a transient `artifacts_not_ready`. A `declined` or `expired` submission sets `error {code}`.
- `integrations/esign/ingest.ts`: `collectArtifacts`, `downloadArtifact` (`https:` only, no auth header, 404 treated as transient) and `ingestSignedArtifacts`, which stores through `storeProviderFile` with `kind 'signature'` and the actor `provider:docuseal`.
- The `'docuseal'` provider and `'signature'` kind were added to the existing unions, `listStuckWebhookEvents` now includes docuseal, and `connectionIdForWebhook` routes by `submission_id`.

## Recorded measurements

- **Webhook POST latency (first delivery, live):** 109 ms.
- **Storage names for the fixture:** `signature/4101/signed-1-Engagement_letter_demo_.pdf` and `signature/4101/audit-log.pdf`, under `firm/{firm}/case/{case}/item/{item}/`.
- **`storeProviderFile` changes:** only the `kind` union was widened. Idempotency, the `%PDF-` check and sha256 were already handled.
- **Phase 5 push row in fake mode:** `logics_pushes` row `e3703532-7b17-412f-971c-8d8b7349bdbf` reached `sent` with fake CaseDocumentID `848362`.

## Verification

- Ran `esign-complete.test.ts` live: 4/4 passed. `esign-reconcile-live.test.ts` live: 7/7 passed.
- Ran both again in parallel with `esign-start`, `connections-tracer` and `logics-push`: 5 files, 28/28 passed.
- Unit tests: `docuseal.test.ts` 11, `ingest.test.ts` 10, `connection-files.test.ts`. All 29 passed.
- `pnpm run check`: the size check, tsc and eslint pass, and 1644 tests pass. One test fails: `src/features/requests/request-builder.test.tsx` (`waitFor` timed out). That file has uncommitted changes from plan 06-05 and nothing in this plan touches it.
- I did not run the full `pnpm test:live` suite (lighter-checks rule).

## Deviations from Plan

1. **[Rule 3 - Blocking] Separate submission ids per live file.** `esign-start.test.ts` holds a docuseal connection with `external_id '4001'` while it runs, and `(provider, external_id)` is unique. The live tests therefore rewrite the 4001/5001 fixtures: `esign-complete` uses 4101/5101 (event key `form.completed:5101:…`, storage `signature/4101/`), and the matrix uses 4201–4205 and 9999. The fixture JSON keeps 4001/5001, and the unit tests use it unchanged.
2. **[Rule 3 - Blocking] `esign-complete` seeds without `logicsCaseId: 900001`.** That value is already used by another test-firm case (`cases_firm_logics_case_idx`). The push matrix uses 900002, which belongs to the shared portal case, so `LOGICS_TEST_CASE_IDS` is `'900002'`.
3. **[Rule 1 - Flake] `connections-tracer.test.ts`:** the `webhook.rejected` count now filters on `actor_id 'truv'`. Otherwise a DocuSeal rejection from a parallel run would be counted (one line, doc updated).
4. **Cron pickup assertion** uses `listStaleConnections(env, 10, 1000)` instead of the default 50. Old stale rows in the shared test project could otherwise push this row out of the result. The query is the same one the cron uses.
5. Added companion docs for the two new unit-test files (`docuseal.test.md`, `ingest.test.md`) to satisfy CLAUDE.md.

## Known Stubs

None.

## Threat Flags

None. The only new surface is `POST /api/webhooks/docuseal` on the existing route, which is covered by T-06-15..19.

## Self-Check: PASSED

- All files under key-files exist. Commits `ec58f93`, `422307b` and `7c8089d` are on `zack`.
