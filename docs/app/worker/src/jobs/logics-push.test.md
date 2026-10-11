# `app/worker/src/jobs/logics-push.test.ts`

Unit ack/retry matrix for `handleLogicsPushPart` (D-03, PUSH-04). Mocked: `../db/logics-pushes` (`claimPush`, `getPushForJob`, `transitionPush`), `./logics-push-normalize` (`ensureNormalized`), `./logics-push-finalize`, `../integrations/logics/config`, `../db/integrations`. The real write guard runs. The client is a real `createFakeLogicsClient({ outcome, delayMs: 0 })` injected through `opts.clientFactory`. Messages are `{ body, ack: vi.fn(), retry: vi.fn(), attempts: 1 }`; env is fake mode, writes on, allowlist `900001`.

| Case | Expected |
|------|----------|
| claim refused, row `queued` | `retry({ delaySeconds: 30 })`, no ack, no transition |
| claim refused, row `sent` | ack once, no retry |
| allowlist `'1'` | failed `logics_write_blocked`, ack once, normalizer not called |
| env `live`, row `fake` | failed `mode_changed`, ack once |
| normalizer `pdf_page_too_large` (manual) | failed with `needsManual: true` and the copy, ack once, client never called, finalizer ran |
| normalizer `storage_read_failed` | failed, `needsManual: false`, ack once, finalizer ran |
| fake `sent` | `sent` with a positive Logics id, ack once, finalizer ran |
| fake `unknown` | `unknown` `logics_no_response`, ack once |
| fake `auth` | failed `logics_auth`, detail `Logics returned HTTP 401`, ack once |
| `createCaseDocument` rejects | `unknown` `logics_no_response`, ack once |

Every case after a successful claim asserts `retry` was never called.
