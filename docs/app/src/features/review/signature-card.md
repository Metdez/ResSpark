# `app/src/features/review/signature-card.tsx`

The staff signature card (Plan 06-07, D-20). `ReviewPanel` renders it inside every `signature` item,
above the item's document rows (the signed PDF and the audit-trail PDF are ordinary Phase 3 rows there).

## Props

- `item`: the `ReviewItem` (its `id` is the `?step=` value, its `label` is the fallback title).
- `signature`: the item's `SignatureView` from the review response, or `undefined` for an older Worker.
- `requestId`: the request, used for the link read, the copy record, the email and the refresh.

## Hooks

- `useQuery({ queryKey: ['request', requestId], queryFn: () => getRequest(requestId) })`: the same key and
  fetcher as the request page, so both share one cache entry. Gives `link.url` and `contact_email`.
- `useMutation(() => emailLink(requestId, item.id))`: the Phase 2 email call with the item as `step`.
- `useRefreshConnection(requestId)` from `connections/use-connections.ts` (Phase 4): posts
  `/api/admin/connections/:id/refresh` and, when it settles, invalidates `['connections', requestId]` and
  `['review', requestId]`. The card then follows the next review read (D-19).

## What it shows

- **Title**: `ESIGN_TEMPLATE_LABELS[template_key]` when the key is a known template, else `item.label`.
- **Chip**: `signatureChip(connection?.stage ?? null)` in a `StatusBadge` (`signature-status.md`).
- **`Test` badge**: an outline `Badge` when `connection.env === 'test'` (D-10).
- **`E-sign not set up`**: a muted line when `signature.configured === false` (DocuSeal unconfigured or the
  template unmapped, D-10). Refresh is hidden then.
- **IRS note**: an `Alert` with `IRS_ONLINE_NOTE[template_key]` for `form_2848` and `form_8821` (D-20,
  RESEARCH Open Question 6). Both read "E-signed copies must be submitted online at IRS.gov/Submit2848 or
  IRS.gov/Submit8821, and you must authenticate the client's identity for a remote signature."; the 2848
  adds "The representative signs Part II outside the portal." The engagement letter has none. Template
  keys come only from `ESIGN_TEMPLATE_KEYS`, so Form 433-A can never reach this card.

## Copy signing link (D-17, SIGN-03)

- The copied URL is `link.url + '?step=' + item.id`: the client's own ResSpark link. The Worker's
  `GET /c/:token?step=` (Plan 06-06) sends the client straight to that step after every link guard. A
  DocuSeal URL or slug is never built, shown, or copied.
- On success: `toast.success('Signing link copied')`, then `markCopied(requestId)` fire-and-forget (logs
  `request.link_copied`; a failed record must not undo the copy, same rule as the request page).
- A clipboard failure shows the request page's `Couldn't copy the link` toast and records nothing.
- With no usable link (`link` is `null`, or revoked so `url` is `null`) Copy and Email are disabled and a
  muted `Send the request first.` line explains why.

## Email signing link (D-17)

Posts the Phase 2 email route with `{ step: item.id }`. The result line reuses `emailCopy` from
`requests-api.ts`, the same copy as the request page: `Email sent to {contact_email}` (emerald), or
`Email not configured — copy the link and send it yourself` / `Email failed — copy the link and send it
yourself` (muted). The button shows a spinner and is disabled while pending.

## Refresh (D-19)

Shown when a connection exists and e-sign is set up. Reads `Refreshing…` and is disabled while pending.
Errors other than 401 toast `GENERIC_ERROR` with the code in muted text, as `ConnectionCard` does
(for example a 502 `provider_unavailable`); a 401 goes on to the app's session handler.

## Test (`signature-card.test.tsx`)

`navigator.clipboard.writeText` is stubbed; `getRequest`, `markCopied` and `emailLink` are mocked through
the requests API module, and `refreshConnection` through `./connections/api`. Cases:

- a done test-mode view shows `Engagement letter`, `Signed`, `Test`; production with no template key shows
  the item label, `Viewed` and no `Test`;
- Copy writes `https://x.example/c/TOKEN?step=<item id>`, toasts `Signing link copied`, calls `markCopied('r1')`;
- a revoked or missing link disables Copy with `Send the request first.`; the HTML never contains `docuseal.com`;
- Refresh calls `refreshConnection('k1')`, shows a disabled `Refreshing…`, then invalidates `['review', 'r1']`;
  a 502 toasts the generic error;
- Email calls `emailLink('r1', <item id>)` and shows `Email sent to morgan.lee@example.com`, or the
  not-configured copy;
- `configured: false` shows `E-sign not set up` and no Refresh;
- the 8821 card shows the IRS sentence without the Part II line, the 2848 card shows both, the engagement
  letter shows no `IRS.gov`.
