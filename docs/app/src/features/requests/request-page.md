# `app/src/features/requests/request-page.tsx`

`RequestPage({ requestId })`: the staff view of one request (REQ-02, REQ-03, D-08, D-09). A draft shows the send form; a sent request shows the copyable client link; every request shows its items with status badges. The component has no router dependency; the route file supplies `requestId` and the page chrome.

| Part | What it does |
|------|--------------|
| `CASE_CHANGED` | Two-part copy for the send route's 409 `case_changed` (LOOK-04): the name or contact in Logics changed since confirm. |
| `FORM_CODES` | `contact_invalid` and `contact_flagged`: refusals shown inside the form, not as an alert. |
| `sendErrorCopy(error)` | `case_changed` and the three Logics codes map to alert copy; anything else returns `undefined`. |
| `Title`, `Heading` | The UI-SPEC Display (24 px / 600, one per page) and Heading (20 px / 600) roles. |
| Detail query | `useQuery(['request', id], getRequest)`. |
| Send mutation | `sendRequest(id, { email, phone, keep_flagged })`. On success it invalidates the detail query. `onError` is `unlessHandled(...)`: form codes and alert codes render here; anything else goes to the app's default handler (401 sign-out, 403, generic toast). |
| Pending | Title `Request` plus three `Skeleton` rows; no form. |
| Error | Title `Request` plus a destructive `Alert` with the generic staff copy and the muted error code. |
| Header | `Request for {First Last}` (or `Request`), the request `StatusBadge`, and the muted `Template: {name}`. |
| Send card | Only while `status === 'draft'` and before a send succeeds: Heading `Send the link`, the send alert when there is one, and `RequestContactForm`. Editing a field resets the mutation, which clears the old refusal. |
| `link` | The stored link once it exists (so a regenerate refetch shows the new URL and expiry); `null` when the stored link is revoked (no URL); before the post-send refetch, the fresh `send.data`. |
| Client link card | Rendered when there is a link or the request is revoked. Heading `Client link`, then `LinkRow`, or the muted line `This link was revoked.` in its place. Below, once the request is past `draft`, `RequestLinkActions` (email, regenerate, revoke, SMS consent) with `onChanged` refetching the detail query. |
| `LinkRow` | A read-only input holding the URL (focus selects all), the primary `Copy link` button, and `Expires {Oct 24, 2026}` with the ISO timestamp in `title`. Copy writes to the clipboard, toasts `Link copied`, and fire-and-forgets `markCopied` (`POST /copied`, D-09). A clipboard failure toasts `Couldn't copy the link` / `Select the link and copy it yourself.` instead. |
| `ItemsCard` | Heading `Items`, one row per item sorted by `position`: label, muted `Required`/`Optional`, and the staff item badge. |

## Notes

- A query error also triggers the app-wide query toast from `main.tsx` (Phase 1). Suppressing it per query needs a change in `main.tsx`; recorded as a follow-up in the 02-05 SUMMARY.

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
- the link actions (`Email link`, `Revoke link`) sit inside the `Client link` card, and `Email link` is an outline button (Copy link stays the only primary);
- a revoked request shows `Revoked`, `This link was revoked.`, and no URL, `Copy link`, or `Revoke link`;
- loading shows three skeletons and no input.
