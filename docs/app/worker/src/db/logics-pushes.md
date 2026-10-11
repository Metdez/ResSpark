# `app/worker/src/db/logics-pushes.ts`

Database access for the Logics push ledger (migration `0006_logics_push`). Every query uses `createAdminClient(env)` (service role, per call); every state change goes through one of the migration's RPCs. Postgres text never leaves this module: errors become fixed tokens.

## Types

- `PushState`: `queued | sending | sent | failed | unknown`. `PushMode`: `fake | live`.
- `PushRow`: one `logics_pushes` row (every column).
- `BatchRow`: one `logics_push_batches` row.
- `FinalizePart`: `{ file_name, part_index, part_count, document_id }`, the shape the finalize RPC returns for each sent or unknown part.
- `PushJob`: a `PushRow` plus what the consumer needs: the batch's `logics_case_id`, `agent_display_name`, `activity_type`, and the source document's `storage_key`, `sha256` (as `source_sha256`), `mime_type` (`source_mime`), `size_bytes` (`source_bytes`).

## Error mapping

`PUSH_TOKENS` lists the RAISE tokens of migration 0006 (`no_items`, `not_pushable`, `already_pushed`, `request_not_found`, `not_found`, `not_resolvable`, `bad_action`, `not_sending`) plus the check name `logics_pushes_sent_has_id`. `pushError(error, fallback)` turns a supabase-js error into `Error(token)`: SQLSTATE `23505` (the fingerprint partial unique index) becomes `already_pushed`; otherwise the first token found among the message's words; otherwise the fallback (`push_create_failed`, …).

## Functions

- `fingerprintHex(caseId, sha256, partIndex)`: lowercase hex SHA-256 of `` `${caseId}|${sha256}|${partIndex}` `` through `crypto.subtle` (D-01). Two documents of a case with identical bytes share the part-0 fingerprint.
- `getFirmRequestCase(env, firmId, requestId)`: `{ id, case_id, logics_case_id }` of a request of this firm (inner join to `cases`), or null for another firm's or a missing request (uniform 404, T-05-05).
- `listPushableDocuments(env, firmId, requestId)`: `ready` documents of the request with their item's `label` and `status`, filtered by `request_items.request_id` and `requests.firm_id` in SQL. It then reads the request's `case_id` (firm-scoped) and appends that case's generated 433-A worksheets (Plan 07-06, D-16): `document_type 'worksheet_433a'`, `status 'ready'`, `request_item_id IS NULL`, with `item_label '433-A worksheet'` and `item_status 'approved'`, so the route's checks pass unchanged. A worksheet of another case is never listed, so the route refuses it with 422 `not_pushable` (T-07-27). Migration 0008's `logics_push_create_batch` enforces the same case rule in SQL. The route checks `item_status === 'approved'`, size and hash.
- `createBatch(env, input)`: `logics_push_create_batch`; returns `{ batchId, pushIds }`; throws `no_items | not_pushable | already_pushed | request_not_found`.
- `getPushForJob(env, pushId)`: the row joined to its batch and document by id only. The consumer has no staff context; the row's own `firm_id` scopes everything after this read.
- `claimPush(env, pushId)`: `logics_push_claim`; null when refused (PostgREST returns an all-null composite, detected by a missing `id`).
- `transitionPush(env, p)`: `logics_push_transition`; true when the row moved, false when the pair is not allowed or the row is no longer in `from`. The DB check `logics_pushes_sent_has_id` surfaces as `Error('logics_pushes_sent_has_id')`.
- `addParts(env, p)`: `logics_push_add_parts` (Plan 03 normalization); returns the inserted sibling ids.
- `finalizeBatch(env, batchId)`: `logics_push_finalize_batch`; null unless this caller won the exactly-once flip.
- `recordBatchActivity(env, p)`: `logics_push_batch_activity`; records the activity note's outcome.
- `resolvePush(env, p)`: `logics_push_resolve` with the staff firm id; returns `{ state, new_push_id }`; throws `not_found | not_resolvable | bad_action`.
- `listLedger(env, firmId, requestId)`: batches newest first (`created_at DESC, id DESC`) each with its pushes oldest first (`created_at, part_index, id`); both queries filter by `firm_id`.

## Tests

Exercised live by `app/worker/test/logics-push.test.ts` and `app/worker/test/logics-rpc.test.ts`; mocked in `routes/admin-logics-push.test.ts` and `jobs/logics-push-finalize.test.ts`.
