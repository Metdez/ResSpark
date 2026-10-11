# `app/worker/test/logics-rpc.test.ts`

The ledger state machine of migration `0006_logics_push` against the live project: races, refusals, the fingerprint guard, finalize-once, staff resolution and the sweeper (PUSH-01 concurrency, PUSH-03, PUSH-04). Run with `pnpm -C app run test:live:file worker/test/logics-rpc.test.ts`; skipped (title names the env) without `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The cases run in order and build on each other.

## Setup

- `pdf(fill)`: 512 bytes starting `%PDF-`, filled with one byte value, so equal fills give equal hashes.
- `beforeAll`: `seedPushRequest` under the test firm on the permanent case `…e6` (`logics_case_id 900002`) with four ready documents of one approved item: `a.pdf`, `b.pdf`, `c-same-as-a.pdf` (same bytes as `a.pdf`), `d.pdf`; plus a `scratch` batch inserted directly (`activity_state 'skipped'`) to hold rows the test puts into a given state.
- Helpers: `item(documentId)` builds a `createBatch` item with `fingerprintHex(case_id, sha256, 0)`; `batch(ids, pushAgain)` calls `createBatch` as `TEST_STAFF_UUID`, fake mode; `row(id)` reads a push; `insertRow(state, extra)` inserts a push in any state into the scratch batch with a random fingerprint; `move(id, from, to, extra)` is `transitionPush`.
- `afterAll`: `cleanup()` removes pushes, batches, objects, documents and the request. Events and the case stay under the test firm.

## Cases

- **(a)** A batch of A, B, C is refused `already_pushed` (C shares A's fingerprint, and A is `queued` inside the same transaction); with `pushAgain: [C]` it is still refused, now by the partial unique index (`23505` mapped to `already_pushed`); no row of either refused batch survives. Then A and B form `batch1` (`id1`, `id2`).
- **(b)** `Promise.all` of two `claimPush(id1)`: exactly one row and one null; `attempts` is 1.
- **(c)** With `id1` `sending`, `claimPush(id2)` (same case) is null and `id2` stays `queued` with `attempts` 0.
- **(d)** Transition table: `queued→sent` and `queued→failed` return false and leave the row; `sending→sent` without a CaseDocumentID throws `logics_pushes_sent_has_id`; `sending→sent` with one returns true and sets `sent_at`; `sent→failed` and `sent→unknown` return false. `id2` is claimed and moved `sending→unknown`; `unknown→queued` is refused. Scratch rows prove `unknown→sent` (staff actor recorded as `resolved_by`), `unknown→failed`, and that `failed→sent` is refused.
- **(e)** `Promise.all` of two `finalizeBatch(batch1)`: exactly one result, with 1 sent and 1 unknown part and `all_failed` false. `recordBatchActivity('sent', 9164821)` records the note; a second call (`failed`) changes nothing.
- **(f)** A direct insert of a second `queued` row with `id1`'s (sent) fingerprint fails with `23505`.
- **(g)** `resolvePush(mark_sent)` on `id2` gives `sent` with `resolved_by` and a NULL `logics_document_id` (the planner assumption); `resend` on the sent `id1` is `not_resolvable`; another firm's id is `not_found`; `resend` on a fresh `unknown` row marks it `failed` / `resent_by_staff` and returns a new `queued` row with the same fingerprint in the same batch.
- **(h)** A batch of D whose only part goes `sending→failed` (then `failed→failed` bookkeeping) finalizes with `all_failed: true`, empty lists, and `activity_state 'skipped'`; a second finalize is null.
- **(i)** `logics_push_sweep()`: a row `sending` since 11 minutes becomes `unknown` / `consumer_lost`; one claimed 1 minute ago stays `sending`; a `queued` row untouched for 6 minutes is in `requeue`. The fresh row is then set `failed` so it does not block the case.
- **(j)** `logics.push_queued`, `logics.push_sending`, `logics.push_sent`, `logics.push_unknown`, `logics.push_resolved` and `logics.activity_sent` events exist for the request.
