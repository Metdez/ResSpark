# `app/worker/src/jobs/index.test.ts`

Unit tests for the queue consumer in `jobs/index.ts` (worker-node project, no network, no database). Run with `pnpm -C app exec vitest run --project worker-node worker/src/jobs/index.test.ts`.

## Mocks

| Mock | Why |
|------|-----|
| `../db/webhook-events` | `getWebhookEvent` returns a `queued` Truv ledger row `E1` (payload `{ order_id: 'ord_1' }`); `markWebhookEvent` records each ledger transition. |
| `../db/connections` | `listNonTerminalConnections`, `recordConnectionEvent` and `updateConnection` are spies. |
| `./reconcile` | `connectionIdForWebhook` resolves `C1`; `reconcileConnection` resolves `{ status: 'done', applied: true }`. Tests override either to throw or to return no match. |
| `./remove-items` | `removeItem` is a spy. |

`console.warn` and `console.error` are silenced; one test reads the `console.error` line.

## Helpers

- `message(body, attempts)`: a queue message with `ack` and `retry` spies.
- `run(queueName, body, attempts)`: calls `queue({ queue, messages: [m] }, env)` and returns the message so the test can read its spies. `MAIN` is `resspark-jobs`; the DLQ is `resspark-jobs-dlq`.
- `event(status)`: the ledger row; `webhookJob`: `{ type: 'webhook', provider: 'truv', ref: 'E1' }`.

## Cases

1. A webhook job acks once, marks the ledger `processing` then `done`, calls `reconcileConnection(env, 'C1', { source: 'webhook', hint: payload })`, and stamps `last_webhook_at`.
2. A transient `ProviderError` (503) retries with `120`, `240`, then (attempt 20) `86400` seconds, and never acks.
3. `retryDelaySeconds` is `min(60 · 2^n, 86400)`: 120, 240, and the 24-hour cap.
4. A `NonRetryableError` acks without retry and marks the ledger `dead` with its message as the code.
5. A reconcile job that fails permanently (`ProviderError` 404) records `job.failed` with the code on the connection and acks.
6. An already-`done` ledger row is a no-op: no reconcile, no ledger write, one ack.
7. No matching connection marks the row `ignored` with `no_connection`.
8. `unmatched_payroll` reconciles every open payroll connection (`listNonTerminalConnections(env, 'payroll', 20)` → `P1`, `P2`) and marks the row `done`.
9. A webhook message on the DLQ marks the row `dead` with `dead_lettered`, reconciles nothing, and acks.
10. A reconcile message on the DLQ writes `job.dead_lettered` on the connection and acks.
11. An unknown job type acks without throwing or retrying.
12. `remove_item` calls `removeItem(env, ref)` and acks; a transient `ProviderError` from it retries instead.
13. The failure log line is exactly `{ job, attempt, error_code }`, with `internal` for a plain `Error`, so an error message (which may hold database detail) never reaches the log.
