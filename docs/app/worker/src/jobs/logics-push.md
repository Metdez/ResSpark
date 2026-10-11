# `app/worker/src/jobs/logics-push.ts`

The queue handler for one Logics push part (`{ type: 'logics_push', provider: 'logics', ref: <logics_pushes.id> }`). `jobs/index.ts` hands it the whole `Message` and does not ack or retry it: this handler owns both (ack-after-dispatch, D-03).

## Exports

- `LogicsPushJob`: the message body type (ids only, never bytes).
- `buildDocumentComment(job)`: the per-document `Comment` sent with the file, D-07 wording verbatim: `Uploaded via ResSpark by {agent display name} — {file name}`, plus ` (part n of m)` when `part_count > 1`.
- `PushOptions`: test seams only, `{ targetBytes?, clientFactory? }`. `targetBytes` lowers the split target (the live multipart test uses 200,000); `clientFactory` replaces `createFakeLogicsClient()` in fake mode so a test can spy on the fake. Production passes nothing.
- `handleLogicsPushPart(msg, env, opts?)`: the handler.

## Internals

- `refusedNote(code)`: a stand-in `createActivity` that returns `failed` with the refusal code. When a part is refused before dispatch (guard, mode, credentials), the batch still finalizes; if a sibling did reach Logics the note's outcome is recorded as `failed` with that code instead of opening a connection the guard just refused.
- `tokenOf(e)`: our own `snake_case` error token or `internal`, so no Postgres or vendor text lands in `error_code`.
- `prepare(env, job, opts)`: every check that must pass before a byte goes out, in order: `logicsWriteGuard(env, String(logics_case_id))` (`logics_write_blocked`; runs in both modes, D-10/C1); `env.LOGICS_MODE` compared with the row's `mode` (`mode_changed`, so a row queued in fake mode is never sent live and vice versa); the client: `createFakeLogicsClient()` in fake mode without reading any credentials, otherwise the firm's `firm_integrations` row must have both ciphertexts and `last_test_ok === true` and decrypt through `liveClientFromRow` (`logics_no_credentials`); then `ensureNormalized(env, job, opts)` from `logics-push-normalize.ts` (download, hash check, split/wrap, stored parts, sibling rows and messages). Returns `{ client, part }` or `{ code, detail, manual, noteClient }`.

## `handleLogicsPushPart(msg, env, opts?)`

1. `claimPush(env, ref)`. When refused, reads the row: still `queued` (a sibling of the case is `sending`) → `msg.retry({ delaySeconds: 30 })` (D-02; nothing was sent); gone or already `sending`/terminal (a redelivery) → `msg.ack()`. A database error during the claim also retries: nothing was sent. This is the file's only `retry` call.
2. `getPushForJob` + `prepare`. Any refusal or error (guard, mode, credentials, a file that cannot be shrunk, a Storage read or write error, a hash mismatch) → `msg.ack()`, `transitionPush(sending → failed, code, detail, needsManual)`, `finalizeBatchIfDone` with the refusal's note client, return. Nothing was sent, and nothing is retried after a claim: staff re-send from the UI. `needsManual` is true only for the normalizer's five codes, whose `detail` is the staff copy from `MANUAL_COPY`.
3. Dispatch: `client.createCaseDocument({ caseId, comment, fileCategoryId, fileName, bytes })` inside `try { … } catch { … } finally { msg.ack() }`. Once dispatch has started the message is acked whatever happens; the queue never redelivers a send (PUSH-04, T-05-01). A runtime throw from the client (it normally returns a result union) is recorded as `unknown` / `logics_no_response`, because the request may already have reached Logics.
4. Ledger: `sent` → `transitionPush(sending → sent, logicsDocumentId)`; `failed` / `unknown` → `transitionPush(sending → failed|unknown, code)` with our own detail text (`Logics returned HTTP 403`) for an HTTP failure. Logics response bodies are never stored.
5. `finalizeBatchIfDone(env, batch_id, client)`: the last part to finish writes the batch's single activity note.

The file contains no `console` call; failures land in the ledger and events. A throw after the ack (a database error while recording) leaves the row `sending`; the cron sweeper (`logics-push-sweep.ts`) moves it to `unknown` after 10 minutes and staff decide.

## Tests

`logics-push.test.ts` (unit; db, normalize, finalize and config modules mocked, fake client injected through `clientFactory`): refused claim on a `queued` row retries in 30 s and never acks; on a terminal row acks; guard refusal (`logics_write_blocked`), `mode_changed`, `pdf_page_too_large` (manual, staff copy, nothing sent), and `storage_read_failed` each fail the row and ack once; `sent`, `unknown`, `logics_auth` and a rejected `createCaseDocument` (`logics_no_response`) each transition and ack once. Every case after a claim asserts `retry` was never called and that the batch finalizer ran.


`app/worker/test/logics-push.test.ts` (live, fake mode): claim, fake send, `ack` exactly once, `retry` never, row `sent` with a synthetic CaseDocumentID, `attempts` 1, one activity note; a redelivered message for the `sent` row is acked with no state change; a 12-page PDF split at a 200,000-byte target goes out as 4 stored parts, all `sent`, with one activity note listing every part.
