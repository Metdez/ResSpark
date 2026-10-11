# `supabase/migrations/0006_logics_push.sql`

Phase 5 schema: the Logics push ledger. Staff push approved documents into the client's IRS Logics case; every part of every push is a row whose state says what we know about its delivery. Applied with `node app/scripts/db-migrate.mjs` and recorded in `public.app_migrations` as `0006_logics_push`. Additive only, re-runnable, wrapped in `BEGIN; ... COMMIT;`.

## Header

States the data rules: nothing earlier is dropped or renamed; the ledger is a delivery log, not a copy of the case file (Logics stays the system of record and has no document list, so `unknown` is a first-class state only staff can resolve); `request_fingerprint` is computed by the Worker so the migration needs no `pgcrypto`; every state change goes through an RPC guarded by `WHERE state = <from>` and writes its `events` row in the same transaction; only the Worker (`service_role`) reads or writes.

## `firm_integrations.settings`

`ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'`. D-08 keys: `file_category_id` (integer, sent as `FileCategoryID` when set), `activity_type` (string, default `General`), `write_enabled`. Plan 05 adds the settings UI; the push route already reads the first two.

## Tables

| Table | Purpose | Key points |
|-------|---------|-----------|
| `logics_push_batches` | One staff click. Owns the single activity note (PUSH-03). | `firm_id`, `case_id`, `request_id` (FKs); `logics_case_id` frozen at push time; `created_by` (staff user id) and `agent_display_name` (frozen for the note); `mode` `fake`/`live`; `file_category_id`, `activity_type` (default `General`) snapshotted from firm settings; `activity_state` in `pending, sending, sent, failed, unknown, skipped` (default `pending`); `logics_activity_id`, `activity_error`; timestamps. |
| `logics_pushes` | One row per document part per attempt. | Every D-01 column: `id, firm_id, case_id, document_id, part_index (default 0), part_count, state, mode, logics_document_id, request_fingerprint, error_code, error_detail, attempts, claimed_at, sent_at, created_at, updated_at, created_by`. `state` in `queued, sending, sent, failed, unknown`; `mode` in `fake, live`. Extra columns: `batch_id` (FK), `request_id` (FK), `file_name` (the name sent to Logics), `part_storage_path`, `part_bytes`, `part_sha256` (Plan 03 normalized parts), `file_category_id`, `needs_manual_compression`, `resolved_by` (staff who resolved an `unknown`). |

Check `logics_pushes_sent_has_id`: a `sent` row has a `logics_document_id` or a `resolved_by` (Pitfall 2: never "sent" without proof).

## Indexes

- `logics_pushes_fingerprint_live` UNIQUE `(request_fingerprint) WHERE state IN ('queued','sending','sent')` (D-01 exact list): the same document part can never be live twice. `unknown` and `failed` are outside it, so a staff resend can queue a new row once the old one is `failed`. A second insert raises `23505`, which the Worker maps to `already_pushed`.
- `logics_pushes_case_state_idx (case_id, state)`: the claim's "is a sibling sending?" check.
- `logics_pushes_batch_idx (batch_id, created_at, part_index, id)`: finalize and the ledger order.
- `logics_pushes_document_idx (document_id)`: the FK to `documents`.
- `logics_push_batches_request_idx (request_id, created_at DESC, id DESC)`: the ledger, newest batch first.

## State machine

| From | To | Who | Function |
|------|----|-----|----------|
| — | `queued` | staff push / staff resend / normalization | `logics_push_create_batch`, `logics_push_resolve`, `logics_push_add_parts` |
| `queued` | `sending` | consumer, only when no row of the same case is `sending` | `logics_push_claim` |
| `sending` | `sent` / `failed` / `unknown` | consumer after the POST (or before it, `failed`, for a pre-dispatch refusal) | `logics_push_transition` |
| `sending` | `unknown` | cron sweeper, `claimed_at` older than 10 minutes (`consumer_lost`) | `logics_push_sweep` |
| `unknown` | `sent` | staff "I checked Logics — it's there" | `logics_push_resolve` (`mark_sent`) or `logics_push_transition` |
| `unknown` | `failed` | staff | `logics_push_transition`; `logics_push_resolve` (`resend`, then a new `queued` row) |
| `failed` | `failed` | resend bookkeeping (`resent_by_staff`) | `logics_push_transition`, `logics_push_resolve` (`resend`) |

Nothing leaves `sent`. `queued → sending` is claim-only.

## Functions

All `plpgsql`, `SECURITY INVOKER`, `SET search_path = ''`.

- `logics_push_create_batch(p_firm_id, p_request_id, p_actor_id, p_agent_display_name, p_mode, p_file_category_id, p_activity_type, p_items jsonb, p_push_again uuid[]) → jsonb`: `no_items` for a missing/empty array; locks the request (`FOR UPDATE OF req`) scoped by firm, `request_not_found` when it is another firm's or the case has no `logics_case_id`; inserts the batch; for each `{document_id, fingerprint, file_name}` checks the document is `ready`, `size_bytes > 0`, has a `sha256`, and belongs to an `approved` item of this request (`not_pushable`); refuses a fingerprint already `queued/sending/sent/unknown` unless the document id is in `p_push_again` (`already_pushed`); inserts the part-0 row and logs `logics.push_queued`. Returns `{ batch_id, push_ids }`. Any refusal rolls back the whole batch.
- `logics_push_claim(p_push_id) → logics_pushes`: reads the row's case, takes `pg_advisory_xact_lock(hashtextextended('logics_push:' || case_id, 0))` so two different rows of one case cannot both pass the `NOT EXISTS` check, then `UPDATE … SET state='sending', claimed_at, attempts+1 WHERE state='queued' AND NOT EXISTS (… o.state = 'sending')`. Logs `logics.push_sending` when it wins; returns an all-NULL row when refused. The lock lives only for the RPC's transaction, never across the HTTP call.
- `logics_push_transition(p_push_id, p_from, p_to, p_logics_document_id, p_error_code, p_error_detail, p_needs_manual, p_actor_id) → boolean`: the allowed pairs only (`sending→sent|failed|unknown`, `unknown→sent|failed`, `failed→failed`); any other pair returns `false` with no write. Updates `WHERE id AND state = p_from` (false when the row has moved); `error_detail` capped at 500 chars; `sent_at` set on `sent`; `resolved_by` set when leaving `unknown` with a staff uuid actor. Logs `logics.push_<to>` with `push_id, document_id, part_index, error_code, logics_document_id` (never `error_detail`). Actor type is `staff` for a uuid actor, otherwise `system`/`queue`.
- `logics_push_add_parts(p_push_id, p_part_count, p_parts jsonb) → uuid[]`: Plan 03 seam. The part-0 row must be `sending` (`not_sending`); it gets `part_count` and part 0's `file_name`, `part_storage_path`, `part_bytes`, `part_sha256`; parts with `part_index >= 1` become sibling `queued` rows (batch, firm, case, request, document, mode, category, creator copied) unless their fingerprint already exists in any state (idempotent re-run). Logs `logics.push_queued` per insert.
- `logics_push_finalize_batch(p_batch_id) → jsonb`: flips `activity_state` `pending → sending` only when no row of the batch is `queued`/`sending`; returns NULL to every caller that does not win the flip (exactly once). Returns `{ batch, sent[], unknown[], all_failed }`, parts ordered `created_at, part_index, id`. When nothing is `sent` or `unknown`, the batch becomes `skipped` immediately (planner assumption: nothing reached Logics, so no "Documents uploaded" note).
- `logics_push_batch_activity(p_batch_id, p_state, p_activity_id, p_error) → boolean`: records the note's outcome from `sending` only (a second call is a no-op returning false); logs `logics.activity_sent` or `logics.activity_failed`.
- `logics_push_resolve(p_push_id, p_firm_id, p_action, p_actor_id, p_logics_document_id) → jsonb`: row locked and firm-scoped (`not_found`). `mark_sent`: `unknown` only (`not_resolvable`) → `sent`, `resolved_by`, optional `logics_document_id` (planner assumption: staff may not know the CaseDocumentID). `resend`: `unknown`, or `failed` without `needs_manual_compression` (`not_resolvable`) → old row `failed` / `resent_by_staff`, then a NEW `queued` row copying batch, document, part and storage fields and the same fingerprint. Logs `logics.push_resolved` and (resend) `logics.push_queued`. Other actions: `bad_action`.
- `logics_push_sweep(p_stale_minutes = 10, p_orphan_minutes = 5) → jsonb`: `sending` rows claimed more than 10 minutes ago become `unknown` / `consumer_lost` (logged `logics.push_unknown`, actor `cron`); returns `{ swept, requeue }`, where `requeue` lists `queued` rows untouched for 5 minutes (safe to re-enqueue because the claim is state-guarded). Plan 03 wires it to the cron.

## Grants

RLS enabled on both tables with no policies; `REVOKE ALL … FROM anon, authenticated`; `REVOKE EXECUTE` on all eight functions (exact signatures) `FROM PUBLIC, anon, authenticated`, then `GRANT EXECUTE … TO service_role` (Supabase SKILL security checklist: new functions are PUBLIC-executable by default). `NOTIFY pgrst, 'reload schema'` so PostgREST sees the new RPCs.

## Tests

- `app/worker/test/logics-push.test.ts`: the fake-mode push end to end.
- `app/worker/test/logics-rpc.test.ts`: the state machine, races, fingerprint guard, finalize-once, resolve and sweep against the live project.
- `app/worker/test/rls.test.ts`: both tables refuse the publishable key (401 `42501`).
