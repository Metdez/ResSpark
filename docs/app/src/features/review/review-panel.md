# `app/src/features/review/review-panel.tsx`

`ReviewPanel({ requestId, caseId })`: the staff review loop on the request page (Plan 03-03; D-05, D-06, D-08, UPL-03, UPL-04, STAT-02). `request-page.tsx` renders it once the request is past `draft`.

| Part | What it does |
|------|--------------|
| `Heading` | The UI-SPEC Heading role (20 px / 600). |
| `DecisionError({ error, notReady })` | Renders nothing unless the error is an `ApiError`. A 409 `item_not_submitted` reads `notReady` (`Nothing to approve yet.` or `Nothing to reject yet.`); anything else reads the generic staff copy. The code follows in 14 px muted text (UI-SPEC Error). `role="alert"` announces it. |
| Hooks | `useReview` (5 s visible-tab poll), `useApprove`, `useReject`, and `rejecting`, the item whose reject dialog is open. |
| No data yet | A card with heading `Review` and either three `Skeleton` rows (loading) or a destructive `Alert` (`Couldn't load the uploads`, the generic copy, the muted code, and a `Retry` button that refetches). Once data has loaded, a failed poll keeps showing the last data (`keepPreviousData`), and polling backs off to 30 s. |
| Header | `Review` and the request badge `<StatusBadge {...requestStatusBadge(request.status)} />`. It flips to `Complete` when the last required item is approved, and back to `In progress` after a rejection, because each decision invalidates this query (D-06). |
| Item section | One bordered section per item, in the order the Worker returns them (`position`, then `id`). Shows the label, `Required`/`Optional`, the staff item badge `<StatusBadge {...itemStatusBadge(item.status, 'staff')} />`, and the item's `rejection_note` as `Note to client: …` when there is one. Items of every kind are listed (bank, payroll, address, signature too), so staff see the same step list as the client. Those kinds have no files and therefore read `No files yet`. |
| `Approve` | Disabled when the item has no files, is already `approved` (the label then reads `Approved`), or is being approved. A click calls `approve.mutate(item.id)`. A double click therefore sends one request, and a second staff member's concurrent approve is a no-op in the RPC. |
| `Reject` | Outline button, 16 px from `Approve`, disabled without files. A click clears the last reject error and opens the dialog for this item. An already approved item can still be rejected (the RPC allows `approved → rejected`). |
| Decision error | Shown under the item that the last approve was for (`approve.variables === item.id`). A reject error is shown inside the dialog. |
| Documents | A dense `Table` (File, Type, Size, Uploaded, Status, and a screen-reader-only Actions header) with one `DocumentRow` per document, or the muted line `No files yet`. |
| `RejectDialog` | Mounted only while an item is being rejected, keyed by the item id. On confirm it calls `reject.mutate({ itemId, note })` and closes on success; on an error the dialog stays open with the message. |

## Tests

`review-panel.test.tsx` (`web` project). `./api` is mocked except for `REJECT_PRESETS` and the guards; `sonner` is mocked; `window.open` is stubbed; `useQuery` is wrapped in a spy that still calls the real hook.

- `useReview` is called with `queryKey ['review', 'r1']`, `refetchInterval: pollInterval`, and `placeholderData: keepPreviousData`.
- A pending fetch shows three `[data-skeleton]` rows.
- Two items render in position order; item 1's two documents in the given order, each with `Preview` and `Download`, and a `Ready` badge; `Approve` is enabled for item 1, disabled for item 2, which reads `No files yet`.
- `Preview` calls `documentUrl('d1', 'inline')` and then `window.open(url, '_blank', 'noopener')`; `Download` calls `documentUrl('d1', 'attachment')`.
- `Reject` opens `Reject this item?` with the four presets; confirm is disabled until `blurry` is chosen; confirming calls `reject('i1', 'blurry')`.
- A 501-character note shows `Keep the note under 500 characters.` and keeps confirm disabled.
- Approve calls `approve('i1')` and invalidates `['review', 'r1']`, `['request', 'r1']`, `['requests']` (the dashboard) and `['events', 'c1']`.
- A 409 `item_not_submitted` on approve shows `Nothing to approve yet.` with `item_not_submitted` in the muted span.
- A rejected item shows `Note to client: blurry` and a `Rejected` badge.

## Address item (Plan 06-03, D-07)

- `address = review.data.address ?? null`.
- For an item with `kind === 'address'`, the `AddressCard` renders inside the item's `<section>`, directly under the header row (and under any rejection note and decision error), where an upload item shows its file table. The "No files yet" line is not shown for an address item.
- Approve and Reject are enabled for an address item once an address exists (`hasFiles` is true for `kind === 'address' && address !== null`), because an address step has no documents. The server still refuses an approval of an item that is not `submitted` (`item_not_submitted`).
