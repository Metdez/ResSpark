# `app/worker/test/fixtures/portal-items.ts`

Live-test fixture for Phase 6 (address and signature items).

- `PORTAL_CASE_ID`: a fixed "Morgan Lee" test case (`morgan.lee@example.com`) under the test firm `00000000-0000-0000-0000-00000000000e`. Cases are never deleted (`events.case_id` has no `ON DELETE`), so the id is fixed and upserted on every run instead of creating a new case each time.
- `seedPortalItems(env, { kinds, signatureTemplate?, logicsCaseId? })`: upserts the firm and the case (setting `logics_case_id` only when given), then inserts an `opened` request, one required `pending` item per kind, and a 14-day client link. `signature` items get `config.template`, default `engagement_letter`.
- Returns `{ firmId, caseId, requestId, linkId, items, cookie(), cleanup() }`. `items` maps each kind to its item id.
- `cookie()`: mints a link token with `CLIENT_LINK_HMAC_KEY` and exchanges it through `GET /c/:token`, exactly like `uploads.test.ts`, and returns the `rs_client=…` pair.
- `cleanup()`: deletes the request's connections, then calls `cleanupRequest` (documents and storage objects, then the request, which cascades items, link, sessions, and consents). Events stay (append-only, test firm only). The case's address columns keep whatever the last run wrote; every confirm overwrites all of them.
- `must()`: throws with the step name when a seed write fails.

## Intake kind (Plan 07-08)

`kinds` also accepts `'intake'`; that item is labelled `Answer a few questions`. Labels come from one `{ address, signature, intake }` lookup. `app/worker/test/intake-live.test.ts` uses it.
