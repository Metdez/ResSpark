# `app/worker/test/esign-reconcile-live.test.ts`

Live D-18 / D-19 / SIGN-02 matrix for `reconcileSignature` (Plan 06-04). Needs `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `CLIENT_LINK_HMAC_KEY`; skipped with a printed reason otherwise. Runs under the test firm only. DocuSeal is stubbed with `stubVendorFetch`; Logics runs in fake mode (`LOGICS_MODE 'fake'`, `LOGICS_WRITE_ENABLED 'true'`, `LOGICS_TEST_CASE_IDS '900002'`), so nothing reaches a Logics host.

## Setup

- `vi.mock('../src/middleware/staff-auth')` sets a fixed admin staff member of the test firm, the way `logics-push.test.ts` does. It affects only this file. The ids are literals because `vi.mock` is hoisted above the imports.
- One `seedPortalItems({ kinds: ['signature'], logicsCaseId: 900002 })` request per case, each with a `docuseal`/`signature` connection on its own submission id: `done 4201`, `notReady 4202`, `declined 4203`, `viewed 4204`, `cron 4205`. The submitter id is the submission id + 1000. Leftover connections with these ids (or `9999`) from a crashed run are deleted first.
- Stubs: `GET /submissions/4201` completed, `4202` completed with no documents and no audit log, `4203` declined, `4204` completed (must never be called); every `docuseal.com/file/*.pdf` serves `fixtures/files/tiny.pdf`. `withId` rewrites the fixture's submission and submitter ids.
- `afterAll` restores the firm's Logics write toggle, deletes this file's two ledger keys, then for each request its `logics_pushes` and `logics_push_batches` rows and the request (connections, documents, objects). Cases are never deleted.

## Tests

1. **rerun:** `reconcileConnection(..., { source: 'client' })` completes 4201 (one `GET /submissions/4201`); a second call with `source: 'staff'` returns `{ status: 'done', applied: false }` with no new DocuSeal call, and the item still has exactly two documents.
2. **not ready:** 4202 rejects with `ProviderError` `artifacts_not_ready`, `transient: true`; the connection stays `pending`; a `reconcile` job through `queue()` calls `retry({ delaySeconds })` and never `ack`.
3. **declined:** 4203 becomes `error` with `error.code 'declined'`; the item is not `submitted`; one `connection.error` event.
4. **viewed:** a signed `webhook_form_viewed.json` for 4204 → 200 → `queue()` acks → one `esign.viewed` event whose payload carries the connection id; status stays `pending`; no `GET /submissions/4204`.
5. **unmatched:** a signed `form.completed` for submission `9999` → 200 → `queue()` acks → the ledger row is `ignored`.
6. **cron pickup:** 4205 with `created_at` and `last_polled_at` 20 minutes ago appears in `listStaleConnections(env, 10, 1000)`. The larger limit (not the cron's 50) keeps leftover stale rows elsewhere in the shared test project from crowding it out; the query itself is the cron's, kind-agnostic.
7. **push:** enable the firm's Logics write toggle, `approveItem` on the 4201 item, `POST /api/admin/requests/<id>/logics-push { document_ids: [signed document id] }` → 202 `mode 'fake'`; `handleLogicsPushPart` with the queued message → the `logics_pushes` row is `sent` with an integer `logics_document_id`.

## Shared state

The firm's `firm_integrations` Logics toggle is shared with `logics-push.test.ts`, which flips it off briefly in its first test. If both files ever overlap at that instant, the push case here can see a 403; rerun the file.
