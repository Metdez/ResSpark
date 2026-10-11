# `app/src/features/client-portal/step-list.tsx`

`StepList({ steps, firmName, onView, onUploadError })`: the client's checklist (D-11, PORT-03).

- **Empty:** a centered block with the Lucide `Inbox` icon (48 px), heading "Nothing to do yet", and "Your agent hasn't added any steps yet. You can close this page."
- **Order:** a sorted copy by `position`. The Worker already sorts; this is defensive and never mutates the prop.
- **Row:** an `<li data-step-row>` with `min-h-11` (44 px), `flex-wrap` so the chip and button drop below the text on a 320 px screen at 200 % zoom, and a bottom border except on the last row.
  - Left: the label (`data-step-label`, `text-base`, `break-words`) and its description from `STEP_DESCRIPTIONS[kind]` (`text-base`, muted).
  - Right: a `StatusBadge size='lg'` (16 px) from `itemStatusBadge(status, 'client')`: Not started, In progress, With your agent (for `submitted`; clients never see "review"), Done, Needs attention. The label text is always present, so the chip never relies on color alone.
  - A `Button size='xl' variant='outline'` "View" (44 px) with `aria-label` "View {label}" so screen readers can tell rows apart. It sets the step being viewed and calls `onView(step)` (a no-op by default). `PortalPage` uses that to send the step kind in the next heartbeat.
- **Sheet:** `viewing` state (`useState`, declared before the empty-state return) picks the sheet below the list. An `upload` step opens `UploadSheet` (Plan 03-02) with the step's `{ id, label, status }` and `onError={onUploadError}`, so upload failures reach `PortalPage`'s heartbeat; every other kind still opens `ComingNextSheet`. Closing either sets `viewing` back to `null`; closing the upload sheet also invalidates `['portal', 'state']` (through `useQueryClient`) so the chip re-renders, for example as With your agent once a file landed. The rejection note is shown inside the upload sheet, never under the row (`/api/c/state` steps carry no note).
- Two steps of the same kind are two rows, each with its own label; `key` is the item id.
- Imports only `@/lib/status`, `ui/button`, `status-badge`, `@tanstack/react-query`, `@/features/uploads/upload-sheet`, the portal types, the copy file, and `coming-next-sheet`. Nothing from the admin shell, `@/lib/api`, or supabase (the uploads feature follows the same rule).

## Tests

- `portal-page.test.tsx`: row height, label size, chips, View size, order, same-kind rows, empty state, and no text below 16 px.
- `step-list.test.tsx`: `View` opens the Coming next sheet with the step label, the copy, and a 44 px Close, and calls `onView` with the step; the vendored icon close is hidden; Close hides the sheet (on an `intake` step, since upload, address, and connect steps have their own sheets). With `UploadSheet` mocked to a stub: `View` on the upload step renders the stub with its label and no Coming next text; `View` on the `intake` step opens Coming next and no stub.

## Address step (Plan 06-03)

`viewing.kind === 'address'` renders `<AddressSheet step={viewing} open onClose={() => setViewing(null)} />` from `./address/address-sheet`. The sheet itself invalidates `['portal','state']` when a save succeeds, so the close handler only clears `viewing`. All other kinds are unchanged: `upload` opens `UploadSheet`, everything else opens `ComingNextSheet`. The test file mocks the sheet and checks that View on an address step opens a dialog titled with the step label.

## Connect steps (Plan 04-05)

`firmName` (required) is the firm name from `/api/c/state`; `PortalPage` passes `data.firm_name`. It reaches the consent sheets ("{firm} receives this information...").

- `viewing.kind === 'payroll_connect'` renders `<PayrollStep step={viewing} firmName={firmName} open onClose={() => setViewing(null)} />` from `./connect/payroll-step`.
- `viewing.kind === 'bank_connect'` renders `<BankStep ... />` from `./connect/bank-step` with the same props.
- `intake` and `signature` (until its own sheet lands) still open `ComingNextSheet`.

Tests: the Coming next cases now use an `intake` step ("Answer a few questions"), since bank steps open the bank sheet. New cases: View on the payroll step opens the real payroll sheet (answered by a `GET /api/c/items/s4/connection` reply) showing `Connect payroll` and no Coming next; View on the bank step shows `Upload statements instead`; an `intake` step still opens Coming next.
