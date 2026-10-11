# `app/src/features/requests/request-page.tsx`

`RequestPage({ requestId })`: the staff view of one request (REQ-02, REQ-03, D-08, D-09, and since Plan 03-03 UPL-03/UPL-04). A draft shows the send form and its items; a sent request shows the copyable client link and the review panel. The component has no router dependency; the route file supplies `requestId` and the page chrome.

| Part | What it does |
|------|--------------|
| `CASE_CHANGED` | Two-part copy for the send route's 409 `case_changed` (LOOK-04): the name or contact in Logics changed since confirm. |
| `FORM_CODES` | `contact_invalid` and `contact_flagged`: refusals shown inside the form, not as an alert. |
| `sendErrorCopy(error)` | `case_changed` and the three Logics codes map to alert copy; anything else returns `undefined`. |
| `Title`, `Heading` | The UI-SPEC Display (24 px / 600, one per page) and Heading (20 px / 600) roles. |
| Detail query | `useQuery(['request', id], getRequest)` with `meta: { errorShown: true }` and `refetchInterval: pollInterval` (`lib/polling.ts`: 5 s while visible, 30 s after an error), so the header badge follows client uploads without a staff action or reload. |
| Send mutation | `sendRequest(id, { email, phone, keep_flagged })`. On success it invalidates the detail query. `onError` is `unlessHandled(...)`: form codes and alert codes render here; anything else goes to the app's default handler (401 sign-out, 403, generic toast). |
| Pending | Title `Request` plus three `Skeleton` rows; no form. |
| Error | Title `Request` plus a destructive `Alert` with the generic staff copy and the muted error code. |
| Header | `Request for {First Last}` (or `Request`), the request `StatusBadge`, and the muted `Template: {name}`. |
| Send card | Only while `status === 'draft'` and before a send succeeds: Heading `Send the link`, the send alert when there is one, and `RequestContactForm`. Editing a field resets the mutation, which clears the old refusal. |
| `link` | The stored link once it exists (so a regenerate refetch shows the new URL and expiry); `null` when the stored link is revoked (no URL); before the post-send refetch, the fresh `send.data`. |
| Client link card | Rendered when there is a link or the request is revoked. Heading `Client link`, then `LinkRow`, or the muted line `This link was revoked.` in its place. Below, once the request is past `draft`, `RequestLinkActions` (email, regenerate, revoke, SMS consent) with `onChanged` refetching the detail query. |
| `LinkRow` | A read-only input holding the URL (focus selects all), the primary `Copy link` button, and `Expires {Oct 24, 2026}` with the ISO timestamp in `title`. Copy writes to the clipboard, toasts `Link copied`, and fire-and-forgets `markCopied` (`POST /copied`, D-09). A clipboard failure toasts `Couldn't copy the link` / `Select the link and copy it yourself.` instead. |
| `ItemsCard` | Heading `Items`, one row per item sorted by `position`: label, muted `Required`/`Optional`, and the staff item badge. |
| Review panel (Plan 03-03) | While the request is a `draft`, `ItemsCard` lists the items. Once it is sent (any other status), `<ReviewPanel requestId caseId />` replaces it: the same items, plus each item's files, Preview/Download, Approve and Reject. Showing both would list every item twice. The panel has its own 5 s polled query (`['review', id]`); the detail query polls on the same 5 s cadence, and the panel's decisions also invalidate `['request', id]` so the header badge follows at once. See `docs/app/src/features/review/review-panel.md`. |
| Connections (Plan 04-06) | In the same non-draft branch, `<ConnectionsPanel requestId />` sits directly above `<ReviewPanel>`: one card per bank or payroll connection with its server-mirrored status badge, last synced and last webhook times, and a Refresh button. It has its own 5 s polled query (`['connections', id]`). A draft shows nothing: the client has not connected anything yet. See `docs/app/src/features/review/connections/connections-panel.md`. |
| Push card (Plan 05-04) | Mounted directly below `<ReviewPanel>` in the same non-draft branch (a fragment holds both): `<LogicsPushCard requestId caseId />` lists approved, ready files and pushes them to Logics. Nothing else on the page changes. See `docs/app/src/features/logics-push/logics-push-card.md`. |
| Client view and timeline (Plan 03-05) | In the same non-draft branch, `<MirrorCard requestId />` sits above the review panel (which step the client is on, last seen, last error, `Client may be stuck`; it reads the panel's `['review', id]` query, so no extra fetch) and `<Timeline caseId />` sits last, below the push card (the case's events newest first, 5 s poll on the first page, `Load older` 50 at a time). A draft shows neither: there is no client activity to mirror yet. See `docs/app/src/features/review/mirror-card.md` and `docs/app/src/features/timeline/timeline.md`. |

## Notes

- `meta.errorShown` tells the app-wide handler in `main.tsx` that this page shows its own error, so a failed load gets no extra toast. A 401 still signs out (Plan 02-08).

## Tests

`request-page.test.tsx` (`web` project; `fetch` stubbed per method and path, `sonner` and `@/lib/supabase` mocked, `navigator.clipboard` and `ResizeObserver` stubbed):

- a draft renders the title, `Draft`, five items in position order with `Not started`, `Send the link`, the prefilled email and `(555) 010-0001`, and an enabled `Send link`;
- `jordan@gmial.com` shows `Did you mean jordan@gmail.com?`, the `Use` button, the keep checkbox, and disables `Send link`;
- `Use jordan@gmail.com` replaces the value and shows `Differs from Logics (j•••@example.com)`;
- ticking the checkbox enables `Send link`;
- sending posts `{ email, phone, keep_flagged: true }` and shows `Client link`, the URL, `Copy link`, and `Expires Oct 24, 2026`;
- `Sending…` while in flight;
- `Copy link` writes the URL, posts `/copied`, and toasts `Link copied`;
- 409 `case_changed` shows the alert and no link;
- 400 `contact_invalid` shows the server's email error under the field (`aria-invalid`, `aria-describedby`);
- 409 `logics_not_configured` shows its alert;
- a sent request shows the link card and no form;
- a sent request mounts the review panel (it fetches `/api/admin/requests/r1/review`, stubbed as pending), the timeline (it fetches `/api/admin/cases/c1/events`, also stubbed as pending, and shows the `Timeline` heading), and no `ItemsCard` rows;
- the link actions (`Email link`, `Revoke link`) sit inside the `Client link` card, and `Email link` is an outline button (Copy link stays the only primary);
- a revoked request shows `Revoked`, `This link was revoked.`, and no URL, `Copy link`, or `Revoke link`;
- loading shows three skeletons and no input.
