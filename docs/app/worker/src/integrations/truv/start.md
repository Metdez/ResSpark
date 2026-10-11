# `app/worker/src/integrations/truv/start.ts`

`startPayroll(env, ctx)` opens (or reuses) the Truv order behind a payroll item (D-05, PAY-01).

## Input

`StartCtx`: the cookie's `ClientCtx`, the session's `ItemRow`, and the case row (`id, first_name, last_name, email, phone_e164`). The plan's `firmName` field is not part of it: Truv needs no firm name, and Plan 04's bank start reads the firm itself.

## Steps

1. **Reuse.** `latestConnectionForItem`. When it is a Truv connection in `pending|connected` with an `external_id`, re-read the order (`getOrder`).
   - Live order: refresh `data.employers` with `summarizeEmployers` and return the same `connection_id` with the order's current `bridge_token` (`reused: true`). A client who taps again adds another employer inside the same order.
   - Expired order (`is_expired`, or no bridge token): `setConnectionStatus(existing, 'error', { code: 'order_expired' })` and fall through to a new order.
2. **Row before URL.** `insertConnection` (`provider 'truv'`, `kind 'payroll'`, status `pending`) before any Truv call, so a crash leaves a visible row the cron can expire, never an order with no row.
3. **Order number.** The request id for the first Truv connection on the item; `<request id>-<n>` for later ones (`n` = prior Truv connections + 1). This is a `shortcut:`: Truv does not document whether `order_number` must be unique.
4. **Create.** `createOrder` with the case's first/last name (`Client`/`Unknown` when null), email, `phone10(phone_e164)`, and `TRUV_TEMPLATE_ID` when non-empty. A `ProviderError` marks the row `error` with the vendor code, then rethrows (the route maps it to 502).
5. **Record.** `updateConnection` stores `external_id = order.id`, the employer summary and `order_expired_at`; `recordConnectionEvent(..., 'connection.started', { provider: 'truv', reused: false })` with actor `client` / `link:<link id>`.

Returns `{ connection_id, bridge_token, reused }`. The bridge token goes only to the client that started the step; it is never stored.
