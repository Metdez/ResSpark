# `app/src/features/client-portal/step-list.tsx`

`StepList({ steps, firmName, onView, onCloseStep, onUploadError })`: the client's checklist (D-11, PORT-03).

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

## Closing a step (Plan 04-05 Task 3)

`onCloseStep` (optional, a no-op by default) is called whenever a step's sheet closes. Every sheet's close goes through one `close()` helper: it clears `viewing` and calls `onCloseStep()`, so `PortalPage`'s heartbeat `last_step` returns to `list`. The connect sheets read the step's `rejection_note` themselves (see `connect/payroll-step.md`). Test: closing the Coming next sheet calls `onCloseStep` once.

## Signature step and deep link (Plan 06-06)

- **Sign button:** for `kind === 'signature'` the row button reads `Sign` (`SIGN_COPY.signButton`) with `aria-label` "Sign {label}", unless the status is `submitted` or `approved`, where it reads `View`. Either way a tap calls `onView(step)` and navigates to `/c/sign/$itemId` (`useNavigate`, `replace: false`); signing is its own full-bleed route, not a sheet, so `signature` never reaches `ComingNextSheet` any more. Every other kind still opens its sheet through the shared `open(step)` helper.
- **`autoOpenId` / `onAutoOpened` (optional):** when `autoOpenId` matches a step, that step opens once, as a tap would (D-17 copied signing link).
  - The sheet opens during render (`autoShown` state is set while rendering, React's "adjust state when a prop changes" pattern) instead of inside an effect, which the `react-hooks/set-state-in-effect` lint rule forbids.
  - After commit an effect (guarded by the `autoAnnounced` ref so it runs once per id) calls `onView(step)`, then either navigates to the signing route with `replace: true` (so the browser Back button cannot land on `/c/?step=` and reopen it in a loop) or calls `onAutoOpened()` so the parent clears `step` from the URL.
  - An id that matches no step does nothing.
- The file now imports `useNavigate` from `@tanstack/react-router`; tests mock it.

Tests (`step-list.test.tsx`, router mocked): a pending signature shows a 44 px `Sign` that navigates to `/c/sign/$itemId` with `replace: false` and calls `onView`; `submitted` and `approved` show `View`; `autoOpenId` on a signature navigates once with `replace: true` and does not call `onAutoOpened`; `autoOpenId` on an upload opens its sheet and calls `onAutoOpened` and `onView` once each; an unknown id opens nothing.

## Intake step (Plan 07-08)

`viewing.kind === 'intake'` renders `<IntakeStep step={viewing} open onClose={close} />` from `./intake/intake-step` (one question per screen, see `intake/intake-step.md`). Every real kind now has its own sheet or route, so `ComingNextSheet` is only the fallback for a kind this list does not know yet.

Tests: the Coming next cases now use a step whose kind is cast from `'later'` (still labelled "Answer a few questions"). A new case opens a real `intake` step, answered by a `GET /api/c/intake` reply, and checks the first prompt `Are you married?` with `Yes` and `No` buttons and no Coming next text.
