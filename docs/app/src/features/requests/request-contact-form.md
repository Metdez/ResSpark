# `app/src/features/requests/request-contact-form.tsx`

The "Send the link" form on a draft request: client email and phone, the typo suggestion, the differs-from-Logics flag, the keep checkbox, and the `Send link` button (D-07, REQ-02).

| Part | What it does |
|------|--------------|
| `formatPhone(e164)` | `+15550100001` to `(555) 010-0001` for the prefilled phone. |
| `Props` | `caseEmail` and `casePhoneE164` (the values Logics had at confirm time, also the prefill), `pending` (send in flight), `serverExtras` (from a 400/409 refusal), `onEdit` (any edit; the page clears the old refusal), `onSend(email, phone, keepFlagged)`. |
| State | `email`, `phone` (controlled inputs), `keep` (the checkbox). |
| `check` | `checkContact({ email, phone })` from `lib/contact.ts`, the same function the Worker runs, on every render. |
| `emailError`, `phoneError`, `suggestion` | The local check first, then the server's extras, in the same inline slots. |
| `emailDiffers`, `phoneDiffers` | A valid value that differs from the Logics value, including when Logics has none on file (the Worker's rule, so the SPA never lets through what the Worker refuses). |
| `flagged`, `canSend` | Anything flagged (a suggestion, a differs, or the server's `differs`) needs the keep checkbox. `Send link` is enabled only with no field error and either nothing flagged or `keep` ticked. |
| `edit(set, value)` | Updates a field, unticks `keep` (the acknowledgement covers the values that were on screen), and calls `onEdit`. |
| `ids`, `describedBy` | Element ids for the hints, joined into `aria-describedby` only for the hints that are showing. |
| Email field | `Label` above the input (8 px gap), `aria-invalid` on error, the error in destructive text, `Did you mean {suggestion}?` with a link-style `Use {suggestion}` button that replaces the value, and `Differs from Logics ({masked})`. |
| Phone field | Same, without a suggestion. |
| Keep checkbox | `Use these values anyway`, rendered only when something is flagged. |
| Submit | `Send link`, `h-10`, right-aligned from 640 px and full width below; while pending it is disabled with a 16 px `Loader2` and reads `Sending…`. Enter submits the form. |

## Notes

- Client-side checks are UX only; the Worker runs the same `checkContact` and the differs rule and refuses without `keep_flagged` (T-02-28).
- No react-hook-form: the suggestion, differs, and keep interplay is custom logic that `checkContact` already returns.
- The plan sketched separate `initialEmail`/`initialPhone` props; they are always the case values on a draft, so `caseEmail`/`casePhoneE164` serve both.
- Covered by `request-page.test.tsx`.
