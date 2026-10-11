# `app/worker/src/routes/admin-logics-push.ts`

Staff routes for pushing documents into Logics (PUSH-01, PUSH-04). `adminLogicsPushRoute` is mounted at `/api/admin` in `index.ts`, before the lookup route. `staffAuth` guards `/requests/*` and `/logics-pushes/*` (it verifies once per request and skips when a sibling already set `staff`). Firm and actor come only from the verified staff context; the Logics CaseID comes only from the confirmed case, never from the body.

## Helpers

- `UUID`, `MAX_DOCUMENTS = 50`, `isUuidList(v)`: body validation.
- `refuse(c, status, code, message?)`: the `{ error: { code, message } }` envelope with a fixed human message the push sheet can show; sets `errorCode` for the allowlisted logger.
- `modeOf(env)`: `live` only when `LOGICS_MODE === 'live'`, otherwise `fake`.
- `RPC_STATUS` + `rpcRefusal(c, e)`: ledger tokens to HTTP: `no_items`/`bad_action` 400 (`bad_action` reported as `bad_request`), `request_not_found`/`not_found` 404 (`not_found`), `already_pushed`/`not_resolvable` 409, `not_pushable` 422. Anything else is rethrown to `onError` (500, no detail).
- `enqueue(env, ref)`: `env.JOBS.send({ type: 'logics_push', provider: 'logics', ref })`, ids only.

## `POST /requests/:id/logics-push`

Body `{ document_ids: uuid[] (1..50), push_again?: uuid[] }`.

1. Not an array → 400 `bad_request`; empty → 400 `no_items`; over 50, a non-uuid, or a bad `push_again` → 400 `bad_request`. Duplicate ids are collapsed.
2. `getFirmRequestCase(staff.firmId, id)` → 404 `not_found` for another firm's request; no `logics_case_id` → 422 `not_pushable` (`This case has no Logics CaseID`).
3. Demo safety (D-10, C1): `LOGICS_WRITE_ENABLED !== 'true'` → 403 `logics_write_blocked` `Logics writes are disabled in this environment`; `logicsWriteGuard` throws → 403 `Case {id} is not on the test allowlist`. Live mode only (locked D-10): fake mode sends nothing to Logics, so the env guard is skipped there and a fake push is accepted with `LOGICS_WRITE_ENABLED=false`; the firm toggle below still applies in both modes.
4. Firm settings are read once with `readSettings(integration)` (D-08). `write_enabled` not `true` (the default, including a firm with no row) → 403 `logics_write_blocked`, `Logics writes are turned off for this firm in Settings`; this is in addition to the env guard above, never instead of it. Live mode then needs a tested integration (both ciphertexts, `last_test_ok === true`) → else 503 `logics_no_credentials`. `file_category_id` (integer >= 1 or `null`, never 0, Pitfall 5) and `activity_type` (default `General`) come from the same settings object.
5. Every id must be a `ready` document of this request under an `approved` item with `size_bytes > 0` and a `sha256` → else 422 `not_pushable` naming the first offender. Fingerprint `fingerprintHex(case_id, sha256, 0)`.
6. `createBatch` (agent = `staff.displayName`, mode, settings, items, `push_again`) → `already_pushed` 409, `not_pushable` 422.
7. One queue message per push id, then 202 `{ batch_id, push_ids, mode }`. A `shortcut:` comment records that a failed `send` after the RPC commit leaves the row `queued` for the cron sweeper (`jobs/logics-push-sweep.ts`) to re-enqueue.

## `GET /requests/:id/logics-pushes`

404 for another firm's request; otherwise 200 `{ mode, batches }` from `listLedger` (batches newest first, pushes oldest first with an id tiebreak).

## `POST /logics-pushes/:pushId/resolve`

Body `{ action: 'mark_sent' | 'resend', logics_document_id?: positive integer }`; anything else 400 `bad_request`. On `resend` only, the firm toggle is read (`readSettings(getIntegration(...)).write_enabled`) and, when not `true`, the route returns 403 `logics_write_blocked` `Logics writes are turned off for this firm in Settings` before touching the ledger (D-08; the consumer re-checks it). `mark_sent` writes nothing to Logics and is allowed either way. `resolvePush` with the staff firm and user → `not_found` 404, `not_resolvable` 409. On `resend` the new row is enqueued. 200 `{ state, new_push_id }`. This is the only path that queues a second POST for a part (D-04).

## Tests

- `admin-logics-push.test.ts` (unit, mocked db and `staffAuth`): body validation, both guard messages in live mode with no batch created, fake mode with writes off and an empty allowlist still accepted (202, `mode: 'fake'`), 404, `not_pushable`, `logics_no_credentials`, the happy path's `createBatch` arguments and one `JOBS.send` per push id, firm settings passed through, the firm write toggle off or missing → 403 with no batch, `already_pushed` 409, GET, resolve validation, resend enqueue, resend with the firm toggle off → 403 with nothing resolved or enqueued, `mark_sent` still allowed with the toggle off, `not_resolvable` 409.
- `app/worker/test/logics-push.test.ts` (live database, fake mode by default): guard refusals with `LOGICS_MODE=live` overridden, `no_items`, a real batch and queue message, `already_pushed`, and the ledger GET after the handler ran.
