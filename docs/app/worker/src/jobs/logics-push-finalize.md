# `app/worker/src/jobs/logics-push-finalize.ts`

Writes the one Logics activity note per push batch (PUSH-03, D-07), after every part of the batch is terminal.

## Exports

- `buildActivityComment(agent, sent, unknown)`: pure. `Documents uploaded via ResSpark by {agent}: ` followed by every sent part, comma separated. A part label is the file name, ` (part n of m)` when `part_count > 1`, and ` rs:{first 8 characters of the document id}` so staff can match a Logics document back to the ResSpark row. When any part is `unknown`, a second line `Unconfirmed (check case documents): …` lists them the same way. Capped at 4,000 characters, ending in `…` when cut.
- `finalizeBatchIfDone(env, batchId, client)`: calls `finalizeBatch`. Returns without a POST when the result is null (another caller won the flip, or parts are still `queued`/`sending`) or `all_failed` (the RPC already marked the batch `skipped`: nothing reached Logics). Otherwise posts `createActivity({ caseId: batch.logics_case_id, activityType: batch.activity_type, subject: 'Documents uploaded via ResSpark', comment })` and records the outcome with `recordBatchActivity`: `sent` with the `ActivityID`, or `failed`/`unknown` with the result code. `Popup` and `Pin` are `false` (set by the client). An activity failure never changes a document row.

`client` is any object with `createActivity`: the live or fake Logics client, or the refusal stand-in from `logics-push.ts`.

## Tests

`logics-push-finalize.test.ts` (unit, mocked `db/logics-pushes`): the exact comment for split and single parts, the unconfirmed line, the 4,000-character cap; no POST and no record when `finalizeBatch` returns null or `all_failed`; one `createActivity` with the batch's `activity_type` and the fixed subject, then `recordBatchActivity('sent', activityId)`; an `unknown` activity result is recorded as `unknown`. Live: `app/worker/test/logics-push.test.ts` (one `logics.activity_sent` event).
