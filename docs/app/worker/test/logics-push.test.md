# `app/worker/test/logics-push.test.ts`

The Phase 5 tracer, live against the Supabase project in `fake` mode: staff route → `logics_push_create_batch` → queue message → `handleLogicsPushPart` → `FakeLogicsClient` → ledger → activity note. No Logics host is ever contacted. Run with `pnpm -C app run test:live:file worker/test/logics-push.test.ts`; skipped (title names the env) without `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.

## Setup

- `vi.mock('../src/middleware/staff-auth')`: `staffAuth` sets `staff = { userId: TEST_STAFF_UUID, firmId: TEST_FIRM_ID, role: 'admin', displayName: 'Test agent' }`. Everything else is live.
- `PDF`: the bytes of `examples/01_marcus_delgado_CNC/01_IRS_Account_Transcript.pdf` (a few KB, synthetic).
- `env`: the Supabase env plus `LOGICS_MODE: 'fake'`, `LOGICS_WRITE_ENABLED: 'true'`, `LOGICS_TEST_CASE_IDS: '900001'`, and `JOBS.send` pushing into `sent`.
- `beforeAll`: `seedPushRequest` (`fixtures/logics-push.ts`) under the test firm: the permanent case `…e5` with `logics_case_id 900001`, a `waiting_on_staff` request, one `approved` upload item, one `ready` document whose object is uploaded to the bucket with its size and SHA-256.
- `afterAll`: `cleanup()` deletes the ledger rows, batches, object, document, item and request. The case and the append-only events stay under the test firm, never visible to ValorTax.

## Cases (in order; each builds on the previous)

1. Writes off → 403, message `Logics writes are disabled in this environment`; allowlist `'1'` → 403, message contains `is not on the test allowlist`; nothing enqueued.
2. `{ document_ids: [] }` → 400 `no_items`.
3. A push → 202 with `batch_id`, one push id, `mode 'fake'`; the row is `queued`, `fake`, part 0, `attempts 0`, fingerprint equal to `fingerprintHex(case_id, sha256, 0)`; one `logics.push_queued` event; exactly one queue message with that `ref`.
4. The same document again → 409 `already_pushed`; still one message.
5. The handler with that message: `ack` once, `retry` never; row `sent` with an integer `logics_document_id`, `attempts 1`, `sent_at` and `claimed_at`; batch `activity_state 'sent'` with an integer `logics_activity_id`; one each of `logics.push_sending`, `logics.push_sent`, `logics.activity_sent`. Prints the synthetic ids.
6. `GET /logics-pushes` → `mode 'fake'`, one batch (`sent` note) with one `sent`, `fake` push.
7. Redelivery of the same message: `ack` once, `retry` never, `attempts` still 1, still one `logics.push_sending` event.

## Multipart suite (`logics push multipart (live, fake mode)`)

PUSH-02 proof. Same env shape, its own `sent` list, and one `createFakeLogicsClient({ delayMs: 0 })` instance whose `createActivity` is spied; the handler receives it through `opts.clientFactory`, with `opts.targetBytes = 200_000`.

- `beforeAll`: `seedPushRequest` with one document, `statement.pdf`, whose bytes are `makeMultiPagePdf(12, 60_000)` (~720 KB). `prefix` is `firm/{test firm}/case/{case}/logics/{document_id}`.
- `afterAll`: lists `prefix` in the `case-documents` bucket and removes every part object, then `cleanup()`.
- The case: POST the push (202); run `handleLogicsPushPart` for every message in `sent`, including the sibling messages part 0 enqueues while running (each: `ack` once, `retry` never). Then the ledger holds N ≥ 3 rows for the document, all `sent`, `part_index` 0..N-1, `part_count` N, `part_storage_path` `{prefix}/part-k.pdf`, `part_bytes` ≤ 200,000, N distinct `part_sha256`; the bucket holds exactly `part-0.pdf` … `part-(N-1).pdf`; `createActivity` ran once and its comment contains `(part k of N)` for every k. Prints the part count, byte sizes and consumer wall-clock (first run: 4 parts of 181,270 bytes, 3.8 s).
