# `app/worker/src/db/integrations.ts`

Worker access to `firm_integrations`, the per-firm encrypted provider credentials (D-01, LOOK-05). Only ciphertext is stored; decryption happens in `integrations/logics/config.ts`.

| Lines | What it does |
|-------|--------------|
| 1 | The per-request admin client. |
| 3-4 | `DbEnv` and `IntegrationProvider` (`logics` only, matching the table's CHECK). |
| 6-18 | `FirmIntegrationRow`: every column. `null` ciphertext means "not entered"; `last_test_ok` `null` means "never tested". |
| 20-33 | `getIntegration`: the single `(firm_id, provider)` row or `null`. Errors become `integration_read_failed`. |
| 35-58 | `upsertIntegration`: inserts or replaces the row on the `(firm_id, provider)` unique constraint, sets `updated_at`, and clears `last_test_ok` and `last_test_at`, so a success recorded for old credentials can never vouch for new ones (D-03). Returns the stored row. Errors become `integration_write_failed`. |
| 60-72 | `recordIntegrationTest`: stores the Test connection result and the time on the firm's row. Errors become `integration_write_failed`. |

## Tests

Mocked in `app/worker/test/admin-lookup.test.ts` and `app/worker/test/admin-integrations.test.ts`.
