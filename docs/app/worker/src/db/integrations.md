# `app/worker/src/db/integrations.ts`

Worker access to `firm_integrations`, the per-firm encrypted provider credentials (D-01, LOOK-05). Only ciphertext is stored; decryption happens in `integrations/logics/config.ts`.

| Lines | What it does |
|-------|--------------|
| 1 | The per-request admin client. |
| 3-4 | `DbEnv` and `IntegrationProvider` (`logics` only, matching the table's CHECK). |
| 6-18 | `FirmIntegrationRow`: every column. `null` ciphertext means "not entered"; `last_test_ok` `null` means "never tested". |
| 20-33 | `getIntegration`: the single `(firm_id, provider)` row or `null`. Errors become `integration_read_failed`. |

## Tests

Mocked in `app/worker/test/admin-lookup.test.ts`.
