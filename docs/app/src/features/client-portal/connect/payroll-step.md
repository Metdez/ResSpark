# `app/src/features/client-portal/connect/payroll-step.tsx`

`PayrollStep({ step, firmName, open, onClose })`: the client's payroll sheet (D-05, D-07, D-15; PAY-01, PAY-03, PAY-04). `StepList` renders it when a `payroll_connect` step's View is tapped.

## Data

`useItemConnection(step.id, open)` loads `ItemConnection` and polls every 5 s while the connection is pending, connected, or syncing. `useConnectFlow` drives consent → start.

## Top-level constants

- `T`: `CONNECT_COPY.payroll`.
- `BADGE`: employer status → `StatusBadge` tone and label: pending → neutral "Waiting", connected → info "Connecting", done → success "Done", error → destructive "Needs attention".
- `plural(n, one)` and `counts(e)`: `2 pay stubs · 1 W-2`; a zero count is left out; one item is singular.

## What renders

Only one sheet is on screen at a time:

1. `uploading` → `UploadSheet` with the step's `{ id, label, status }`. Closing it returns to the payroll sheet and invalidates `['portal', 'state']` so the step chip updates.
2. `flow.consenting` → `ConsentSheet` for `payroll_data` with the firm name.
3. Otherwise the payroll sheet, open while `open && !bridgeOpen`: title = `step.label` (20 px), the state below, then `Upload pay stubs instead` (44 px, outline) in every state. The sheet scrolls (`max-h-dvh`, `overflow-y-auto`) when many employers are listed.

## States

| Condition | Message | Buttons |
| --- | --- | --- |
| loading | three `Skeleton` rows | upload |
| query failed | Something went wrong. Try again. | upload |
| `provider.configured === false`, or a `provider_not_configured` start error | `notConfigured` | upload |
| no connection, or `removed` | `intro` | `Connect payroll`, upload |
| `error` | `connectErrorCopy(error_code)` (for example `order_expired` → "This request expired. Ask your agent to send a new link.") | `Try again`, upload |
| `pending` | Finishing up… | `Add another employer`, upload |
| `connected` / `syncing` | Payroll connected. We're getting your pay stubs now. | `Add another employer`, upload |
| `done` | Done. Your agent has what they need. | `Add another employer`, upload |

`Add another employer` stays at `done` so a client with a second job at a different payroll provider can connect it after the first Bridge session has closed. The server's `startPayroll` reuses only a `pending` or `connected` order, so a tap at `done` creates a new order on the same item.

When a connection has employers, each is a 44 px row (`data-employer`): `company_name` (or "Employer"), the counts line, and a 16 px `StatusBadge` from `BADGE`. The badge always carries its label, so status never relies on color.

## Connect flow

`Connect payroll`, `Add another employer`, and `Try again` all call `flow.connect()` → (consent) → `startConnection('payroll', step.id)` → `open`:

1. No `bridge_token` in the start result → `provider_error` copy.
2. `loadTruvBridge()`; a load failure toasts `bridgeFailed`.
3. `bridgeOpen` is set. The Radix sheet is modal (it blocks pointer events on the page and traps focus), so it steps aside while the Bridge overlay is up.
4. `init({ isOrder: true, bridgeToken, onEvent, onClose }).open()`.
   - `onEvent(type, payload, source)`: only `source === 'order'` with `type === 'COMPLETED'` reconciles. A Bridge-level `SUCCESS` means one employer linked, not that documents are ready, so it never advances anything.
   - `onClose`: clears `bridgeOpen` (the sheet comes back) and reconciles.
   - Reconcile is `reconcileConnection(connection_id)` then `refetch()`.

Each tap creates a new connection server-side, which is how a client with two jobs adds the second employer. The Bridge URL lives only in `use-truv-bridge.ts`.

Errors from any step show one sentence through `useConnectFlow`'s toast.

## Rejected step (`rejection_note`)

`/api/c/state` steps carry no rejection note, so `useRejectionNote(step, open)` reads `rejection_note` from `listItemDocuments(step.id).item` (query key `['portal', 'item', id, 'documents']`, shared with `UploadSheet`), only while the sheet is open and the step is `rejected`. When a note exists:

- "Your agent asked for a new copy: {note}" (Phase 3's `uploadCopy.rejectedPrefix`, 16 px, muted) appears under the message;
- the upload button becomes the primary action: it moves above the connect button and uses the default (filled) variant, while the connect button turns outline.

## Stale consent and errors

`onConsentStale` refetches the item connection. A start failure with `consent_text_stale` or `consent_required` (handled in `useConnectFlow`) reopens the consent sheet with "Please read and agree again." as its notice and shows no toast; agreeing again records the consent and starts. Every other failure shows exactly one `toast.error` and no inline alert.

## Accessibility gates

Every button is `size='xl'` (44 px, or `min-h-11` where the label may wrap), text is never below 16 px, and status is always a word plus a tone. The spinners carry `motion-reduce:animate-none`.

## Tests

See `payroll-step.test.md`.
