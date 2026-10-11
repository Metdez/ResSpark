# `app/worker/src/jobs/logics-push.ts`

The queue handler for one Logics push part (`{ type: 'logics_push', provider: 'logics', ref: <logics_pushes.id> }`). `jobs/index.ts` hands it the whole `Message` and does not ack or retry it: this handler owns both (ack-after-dispatch, D-03).

## Exports

- `LogicsPushJob`: the message body type (ids only, never bytes).
- `buildDocumentComment(job)`: the per-document `Comment` sent with the file, D-07 wording verbatim: `Uploaded via ResSpark by {agent display name} — {file name}`, plus ` (part n of m)` when `part_count > 1`.
- `handleLogicsPushPart(msg, env)`: the handler.

## Internals

- `refusedNote(code)`: a stand-in `createActivity` that returns `failed` with the refusal code. When a part is refused before dispatch (guard, mode, credentials), the batch still finalizes; if a sibling did reach Logics the note's outcome is recorded as `failed` with that code instead of opening a connection the guard just refused.
- `tokenOf(e)`: our own `snake_case` error token or `internal`, so no Postgres or vendor text lands in `error_code`.
- `sha256hex(bytes)`: lowercase hex SHA-256 through `crypto.subtle`.
- `ensureNormalized(env, job)`: the bytes to send. In Plan 01 it handles only the pass-through case (`part_storage_path` null, `application/pdf`, size known and at most `LOGICS_MAX_PART_BYTES`): downloads `storage_key` from the `case-documents` bucket with the admin client and checks its SHA-256 against the upload's hash (`source_hash_mismatch`; `source_read_failed` if the download fails). Everything else (images, oversized PDFs, stored parts) returns `normalization_pending`. A `shortcut:` comment names Plan 03, which replaces it with `normalizeForLogics`.
- `prepare(env, job)`: every check that must pass before a byte goes out, in order: `logicsWriteGuard(env, String(logics_case_id))` (`logics_write_blocked`; runs in both modes, D-10/C1); `env.LOGICS_MODE` compared with the row's `mode` (`mode_changed`, so a row queued in fake mode is never sent live and vice versa); the client: `createFakeLogicsClient()` in fake mode without reading any credentials, otherwise the firm's `firm_integrations` row must have both ciphertexts and `last_test_ok === true` and decrypt through `liveClientFromRow` (`logics_no_credentials`); then `ensureNormalized`. Returns `{ client, part }` or `{ code, detail, noteClient }`.

## `handleLogicsPushPart(msg, env)`

1. `claimPush(env, ref)`. When refused, reads the row: still `queued` (a sibling of the case is `sending`) → `msg.retry({ delaySeconds: 30 })` (D-02; nothing was sent); gone or already `sending`/terminal (a redelivery) → `msg.ack()`. A database error during the claim also retries: nothing was sent. This is the file's only `retry` call.
2. `getPushForJob` + `prepare`. Any refusal or error → `transitionPush(sending → failed, code, detail)`, `msg.ack()`, `finalizeBatchIfDone` with the refusal's note client, return.
3. Dispatch: `client.createCaseDocument({ caseId, comment, fileCategoryId, fileName, bytes })` inside `try { … } finally { msg.ack() }`. Once dispatch has started the message is acked whatever happens; the queue never redelivers a send (PUSH-04, T-05-01).
4. Ledger: `sent` → `transitionPush(sending → sent, logicsDocumentId)`; `failed` / `unknown` → `transitionPush(sending → failed|unknown, code)` with our own detail text (`Logics returned HTTP 403`) for an HTTP failure. Logics response bodies are never stored.
5. `finalizeBatchIfDone(env, batch_id, client)`: the last part to finish writes the batch's single activity note.

The file contains no `console` call; failures land in the ledger and events. A throw after the ack (a database error while recording) leaves the row `sending`; the Plan 03 sweeper moves it to `unknown` after 10 minutes and staff decide.

## Tests

`app/worker/test/logics-push.test.ts` (live, fake mode): claim, fake send, `ack` exactly once, `retry` never, row `sent` with a synthetic CaseDocumentID, `attempts` 1, one activity note; a redelivered message for the `sent` row is acked with no state change.
