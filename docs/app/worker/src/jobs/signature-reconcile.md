# `app/worker/src/jobs/signature-reconcile.ts`

`reconcileSignature(env, conn, opts)`: the `signature` branch of `reconcileConnection` (Plan 06-04, D-18, D-19, SIGN-02). The webhook consumer, the 15-minute cron, staff Refresh and the client's post-signing reconcile all reach it through `reconcileConnection`.

## Event → action

| Input | Action | Vendor call | Status change |
|-------|--------|-------------|---------------|
| connection `done` or `removed`, or no `external_id` | return the current status | none | none |
| hint `form.viewed` | `recordConnectionEvent('esign.viewed', { submitter_id })` | none | none |
| hint `form.started` | `recordConnectionEvent('esign.started', { submitter_id })` | none | none |
| anything else (`form.completed`, `form.declined`, cron, staff, client) | `GET /submissions/{external_id}` | yes | by submission status below |
| submission `completed`, artifacts present | `ingestSignedArtifacts` (signed PDFs + audit log), then `setConnectionStatus('done', { documents: created })` | file downloads | `done` → item `submitted`, request recomputed |
| submission `completed`, no documents or no `audit_log_url` | throw `ProviderError('docuseal', null, 'artifacts_not_ready', true)` | — | none; the queue retries with backoff (RESEARCH A6) |
| submission `declined` | `setConnectionStatus('error', { code: 'declined' })` | — | `error` |
| submission `expired` | `setConnectionStatus('error', { code: 'expired' })` | — | `error` |
| submission `pending` or anything else | return unchanged | — | none |

`viewed` and `started` never set `connected`: `connection_set_status` would mark the item `submitted` before anything was signed (D-18). The webhook payload never decides status; only the re-read submission does (D-19).

## Idempotency

A `done` connection returns before any DocuSeal call. Storage paths are deterministic (`signature/{submission_id}/{name}`), so a rerun of a partly finished ingest downloads only what is missing. Document URLs are taken from the fresh submission on every attempt and never stored (40-minute TTL, A5).

## Cron

There is no signature-specific cron. The 15-minute tick's `listStaleConnections` sweep is kind-agnostic with Phase 4's batch size of 50 (kept as is), so a stale pending signature (a missed webhook, or DocuSeal test mode not sending webhooks) heals through the same reconcile.

## Tests

`test/esign-complete.test.ts` (completed path, live) and `test/esign-reconcile-live.test.ts` (rerun, not-ready retry, declined, viewed, unmatched, cron pickup, Logics push in fake mode).
