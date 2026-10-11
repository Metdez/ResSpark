# `app/src/features/requests/request-link-actions.tsx`

`RequestLinkActions({ request, onChanged })`: the secondary actions under the client link on the request page (REQ-03, REQ-04, REQ-05, D-08, D-09). `Copy link` stays in `request-page.tsx` as the page's only primary button; everything here is `outline`.

| Part | What it does |
|------|--------------|
| `CONFLICTS`, `isConflict(e)` | The Worker's 409 codes for a link that changed under the user (`request_not_active` from regenerate, `request_revoked` from revoke). |
| `emailCopy(result, to)` | Imported from `requests-api.ts` (moved there in Plan 06-07 so the signature card reuses it). Turns the email route's always-200 answer into one truthful line: `Email sent to {contact_email}`, `Email not configured — copy the link and send it yourself` (`not_configured`), or `Email failed — copy the link and send it yourself` (`send_failed`, and `no_link`). |
| Props | `request`: the `RequestDetail` from the page's query. `onChanged()`: called after a regenerate or revoke (success or 409) so the page refetches and shows the new URL, expiry, or revoked state. |
| `dialog` state | Which confirm dialog is open (`regenerate`, `revoke`, or none). |
| `linkChange` | Shared mutation options for regenerate and revoke. `onError` is `unlessHandled(qc, isConflict)`: 409s render here, anything else reaches the app handler (401 sign-out, 403, generic toast). `onSettled` closes the dialog and calls `onChanged` on success or a 409. |
| `email` mutation | `emailLink(id)`. Errors (5xx) fall to the app's default toast; the result line is never shown together with a toast. |
| `regenerate`, `revoke` mutations | `regenerateLink(id)`, `revokeLink(id)`. The `(_: void)` parameter pins the mutation variables to `void` so `mutate()` takes no argument. |
| `consent` mutation | `recordConsent(id)` posts `{ agreed: true }`. The checkbox is checked and disabled while pending or after success, so a double click cannot post twice; a failure leaves it unchecked and shows the app's generic toast. |
| `phone` | `contact_phone_e164`, else the case's `phone_e164`. Without either, the consent control is not rendered. |
| Conflict notice | A default-variant `Alert`: `This link was already changed` / `Reload the page to see the latest state.` It is a state notice, not a form error. |
| Buttons row | Hidden once `status === 'revoked'` (so Regenerate after Revoke never appears). `Email link` (loading `Emailing…` with a spinner), `Regenerate link`, `Revoke link` (outline with destructive text), 16 px gap. The email result line sits below: success in the palette's emerald text, failures muted. |
| Consent checkbox | `Client agreed on this call to receive a text at {(•••) •••-1234}`. After success the muted line `Recorded {Oct 11, 2026}` (from the mutation's `submittedAt`). The platform never sends a text; this only writes `consent.sms` (M1). |
| Regenerate dialog | House `ConfirmDialog`: `Regenerate this link?` / `The link you already sent stops working. Copy and send the new one.`, confirm `Regenerate link` (default variant), `Cancel`. |
| Revoke dialog | `Revoke this link?` / `The client's current link stops working immediately. You can send a new one.`, confirm `Revoke link` with the destructive variant (the only destructive-styled element here), `Cancel`. Radix `AlertDialog` puts focus on Cancel when it opens. |

## Tests

`request-link-actions.test.tsx` (`web` project; `test-utils/query-render` harness, `fetch` answered per method and path, `sonner` and `@/lib/supabase` mocked), 15 cases:

- the three buttons and the unchecked consent checkbox render for a sent request;
- `Email link` posts `/email` and reads `Emailing…` (disabled) while pending;
- `{ ok: true }` shows `Email sent to jordan.rivera@example.com`; `not_configured` and `send_failed` show their copy;
- Regenerate opens its dialog with the title, body, and a non-destructive confirm, and sends nothing until confirmed; confirming posts `/regenerate`, calls `onChanged`, and closes the dialog;
- Revoke opens its dialog with a destructive confirm and focus on Cancel; Cancel closes with no request; confirming posts `/revoke` and calls `onChanged`;
- a 409 from revoke or regenerate shows `This link was already changed` and calls `onChanged`;
- ticking consent posts `{ agreed: true }`, then the box is checked, disabled, shows `Recorded`, and a second click posts nothing;
- a revoked request renders only the consent control; no phone on file renders no consent control.
