# `app/worker/src/jobs/reconcile.ts`

The single reconcile function (D-04) behind the webhook consumer, the cron (Plan 02), the client return (Plans 03/04) and staff Refresh (Plan 02), plus the webhook-to-connection matcher.

## `ReconcileOpts`

`source` (`webhook | cron | client | staff`), optional `hint` (the verified webhook payload; adapters may use it but never trust it for status), optional `actorId` (passed to `connection_set_status` as the event actor).

## `reconcileConnection(env, connectionId, opts)`

1. Loads the connection; missing → `NonRetryableError('connection_not_found')`.
2. `removed` is terminal: returns `{ status: 'removed', applied: false }` without calling the vendor.
3. `payroll` → `reconcilePayroll`. `signature` → `reconcileSignature` (Plan 06-04, `jobs/signature-reconcile.ts`). `bank` → `reconcileBank` (Plan 04-04, `jobs/bank-reconcile.ts`): session completion, public-token exchange into the vault, and (Task 2) the sync and statements.
4. Always (in `finally`) stamps `last_polled_at`, so the cron's "least recently polled first" ordering advances even when the vendor call fails.

Every path that changes status ends in `setConnectionStatus` (the RPC); nothing here writes `connections.status`.

## `connectionIdForWebhook(env, event)`

- Truv: `order_id` → `findConnectionByExternalId('truv', …)`; else `link_id` → `findConnectionByEmployerLink`; else `'unmatched_payroll'` (a task event for a link not stored yet).
- Plaid: `link_token` → `findConnectionByLinkRef`; else `item_id` → `findConnectionByExternalId('plaid', …)`; else `null`.
- DocuSeal: `data.submission_id` (an integer) → `findConnectionByExternalId('docuseal', String(id))`; else `null`, which the consumer records as `ignored`. Never `data.id`: in DocuSeal form events that is the submitter id (RESEARCH contradiction 5).
- Any other provider: `null`.

`str(v)` accepts non-empty strings only, so a missing or numeric field never becomes a lookup.
