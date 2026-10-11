# `app/src/features/review/signature-card.tsx`

The staff signature card (Plan 06-07, D-20). `ReviewPanel` renders it inside every `signature` item,
above the item's document rows.

## Props

- `item`: the `ReviewItem` (its `id` is the `?step=` value, its `label` is the fallback title).
- `signature`: the item's `SignatureView` from the review response, or `undefined` for an older Worker.
- `requestId`: the request, used for the link read and the copy record.

## What it shows

- **Title**: `ESIGN_TEMPLATE_LABELS[template_key]` when the key is a known template, else `item.label`.
- **Chip**: `signatureChip(connection?.stage ?? null)` in a `StatusBadge` (`signature-status.md`).
- **`Test` badge**: an outline `Badge` when `connection.env === 'test'` (D-10), so staff know a signature
  was made against DocuSeal's test environment.

## Copy signing link (D-17, SIGN-03)

- The request detail is read with `useQuery({ queryKey: ['request', requestId], queryFn: () => getRequest(requestId) })`,
  the same key and fetcher as the request page, so both share one cache entry and one fetch.
- The copied URL is `link.url + '?step=' + item.id`: the client's own ResSpark link. The Worker's
  `GET /c/:token?step=` (Plan 06-06) sends the client straight to that signing step after every link
  guard has run. A DocuSeal URL or slug is never built, shown, or copied.
- On success: `toast.success('Signing link copied')`, then `markCopied(requestId)` fire-and-forget (it logs
  `request.link_copied`; a failed record must not undo the copy, same rule as the request page).
- A clipboard failure shows the request page's `Couldn't copy the link` toast and records nothing.
- With no usable link (`link` is `null`, or revoked so `url` is `null`) the button is disabled and a muted
  `Send the request first.` line explains why.

## Test (`signature-card.test.tsx`)

`navigator.clipboard.writeText` is stubbed; `getRequest` and `markCopied` are mocked through the requests
API module. Cases: a done test-mode view shows `Engagement letter`, `Signed`, `Test`; production with no
template key shows the item label, `Viewed` and no `Test`; the copy writes
`https://x.example/c/TOKEN?step=<item id>`, toasts `Signing link copied` and calls `markCopied('r1')`; a
revoked or missing link disables the button with `Send the request first.`; the rendered HTML never
contains `docuseal.com`.
