# `app/worker/src/db/integrations.ts`

Worker access to `firm_integrations`, the per-firm encrypted provider credentials (D-01, LOOK-05). Only ciphertext is stored; decryption happens in `integrations/logics/config.ts`.

| Lines | What it does |
|-------|--------------|
| 1 | The per-request admin client. |
| 3-4 | `DbEnv` and `IntegrationProvider` (`logics` only, matching the table's CHECK). |
| 6-19 | `FirmIntegrationRow`: every column, including `settings` (jsonb, migration 0006). `null` ciphertext means "not entered"; `last_test_ok` `null` means "never tested". |
| 21-27 | `LogicsSettings` (D-08): `file_category_id` (number or `null`), `activity_type`, `write_enabled`, `activity_types_seen`. |
| 29-41 | `readSettings(row)`: defaults for a missing row or key; unknown keys ignored. `file_category_id` only an integer >= 1, else `null` (Pitfall 5: never 0); `activity_type` trimmed, else `'General'`; `write_enabled` only when exactly `true` (default `false`); `activity_types_seen` strings only (default `[]`). |
| 43-53 | `updateSettings(env, firmId, patch)`: reads the row, merges `patch` over its `settings`, and upserts only `{ firm_id, provider, settings }` on `(firm_id, provider)`, so a firm can set this before saving credentials and the credential columns are untouched. Read-then-write: two admins racing is last-writer-wins, not a safety issue. Returns `readSettings` of the merged object; errors become `integration_write_failed`. |
| 55-68 | `getIntegration`: the single `(firm_id, provider)` row or `null`. Errors become `integration_read_failed`. |
| 70-93 | `upsertIntegration`: inserts or replaces the row on the `(firm_id, provider)` unique constraint, sets `updated_at`, and clears `last_test_ok` and `last_test_at`, so a success recorded for old credentials can never vouch for new ones (D-03). Returns the stored row. Errors become `integration_write_failed`. |
| 95-107 | `recordIntegrationTest`: stores the Test connection result and the time on the firm's row. Errors become `integration_write_failed`. |

## Tests

Mocked in `app/worker/test/admin-lookup.test.ts`, `app/worker/test/admin-integrations.test.ts` and `app/worker/src/routes/admin-integrations.test.ts` (the last two keep the real `readSettings`).
