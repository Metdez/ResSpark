# `app/src/features/client-portal/connect/bank-step.tsx`

`BankStep({ step, firmName, open, onClose })`: the client's bank sheet (D-08, D-10, D-11, D-15; BANK-01, BANK-03, BANK-04, BANK-05). `StepList` renders it when a `bank_connect` step's View is tapped.

Every decision reads `provider.configured` and `provider.capabilities`; nothing branches on which provider it is (D-11), so Teller can replace Plaid without touching this file.

## Data

`useItemConnection(step.id, open)` loads `ItemConnection` and polls every 5 s while the connection is pending, connected, or syncing. `useConnectFlow` drives consent → start.

## What renders

Only one sheet is on screen at a time:

1. `uploading` → `UploadSheet` with the step's `{ id, label, status }`. `uploading.month` is the month being filled, or `null` for the plain fallback.
2. `flow.consenting` → `ConsentSheet` for `bank_data` with the firm name.
3. Otherwise the bank sheet: title = `step.label`, the message, the connect button when allowed, the accounts, then `Upload statements instead` (44 px, outline) in every state.

## States (message)

| Condition | Message | Connect button |
| --- | --- | --- |
| loading | three `Skeleton` rows | no |
| query failed | Something went wrong. Try again. | no |
| `configured === false` or a `provider_not_configured` start error | `notConfigured` (upload is the only button) | no |
| `capabilities.hostedLink !== true` | `notAvailable` | no |
| no connection, or `removed` | `intro` when `statementPdfs`, else `introNoStatements` | `Connect bank` |
| `error` | `connectErrorCopy(error_code)` (e.g. `ITEM_LOGIN_REQUIRED` → "Your bank asked you to sign in again. Connect your bank again.") | `Connect bank` |
| `pending` | Checking your connection… | no |
| `connected` / `syncing` | Bank connected. Your bank is sending the history — this can take a few minutes. | no |
| `done` | Done. Your agent has what they need. | no |

A new tap after an error creates a new connection server-side.

## Connect flow (same tab)

`Connect bank` → `flow.connect()` → (consent) → `startConnection('bank', step.id)` → `open`: with no `hosted_link_url` it fails as `provider_error`; otherwise `redirecting` is set (the button reads "Opening your bank…" with a spinner and stays disabled) and `window.location.assign(hosted_link_url)` leaves for the bank in the same tab. The bank returns the client to `/c/return` (see `return-page.md`).

## Accounts and months

Once a connection exists (and the provider is configured), each account is a section headed `name ?? 'Account'` plus `••mask`, with `StatementCells` listing its months. A month upload button stores `{ connectionId, accountId, year, month, openedAt: Date.now() }` and opens `UploadSheet`.

When that upload sheet closes:

1. `['portal', 'state']` is invalidated (the step chip may change).
2. `attribute(month)`: `listItemDocuments(step.id)`, then for each `ready` document whose `uploaded_at` is after `openedAt`, `attributeStatement(connectionId, { document_id, bank_account_id, year, month })`. A 409 `month_available` (the bank delivered that month meanwhile) is swallowed; the upload stays a plain document. Other errors are swallowed too, since the upload itself already succeeded.
3. `refetch()` so the month shows "Received".

Shortcut (noted in code): the "after `openedAt`" test compares the server timestamp with the phone clock. Upgrade path: snapshot the document ids when the upload sheet opens.

The plain `Upload statements instead` opens `UploadSheet` with no month and never attributes.

## Rejected step (`rejection_note`)

`/api/c/state` steps carry no rejection note, so `useRejectionNote(step, open)` reads `rejection_note` from `listItemDocuments(step.id).item` (query key `['portal', 'item', id, 'documents']`, shared with `UploadSheet`), only while the sheet is open and the step is `rejected`. When a note exists:

- "Your agent asked for a new copy: {note}" (Phase 3's `uploadCopy.rejectedPrefix`, 16 px, muted) appears under the message;
- the upload button becomes the primary action: it moves above the connect button and uses the default (filled) variant, while the connect button turns outline.

## Stale consent and errors

`onConsentStale` refetches the item connection. A start failure with `consent_text_stale` or `consent_required` (handled in `useConnectFlow`) reopens the consent sheet with "Please read and agree again." as its notice and shows no toast; agreeing again records the consent and starts. Every other failure shows exactly one `toast.error` and no inline alert.

## Accessibility gates

Every button is `size='xl'` (44 px, or `min-h-11` where the label may wrap), text is never below 16 px, and status is always a word plus a tone. The spinners carry `motion-reduce:animate-none`.

## Tests

See `bank-step.test.md`.
