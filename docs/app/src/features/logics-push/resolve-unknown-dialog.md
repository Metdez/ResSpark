# `app/src/features/logics-push/resolve-unknown-dialog.tsx`

The staff decision for a push that Logics did not clearly confirm (`unknown`), and the resend-only path for an ordinary `failed` row (Phase 5 D-04, PUSH-04).

| Part | What it does |
|------|--------------|
| `when(iso)` | Formats the time for the body, e.g. `Oct 11, 9:00 AM` (en-US, local time zone). |
| `ResolveUnknownDialog(props)` | `push` (`null` renders nothing), `onOpenChange`, `requestId`, `caseId`, `allowMarkSent` (`true` for `unknown`, `false` for `failed`). Uses `useResolvePush(requestId, caseId)`. A `Dialog`, not an `AlertDialog`, because it holds an input. |
| Focus | `onOpenAutoFocus` moves the first focus to `Cancel`, so Enter never triggers a decision by accident. |
| Unknown body | Title `Logics didn't confirm this file`; text `ResSpark sent {file} to Logics at {time} and did not get a readable answer. Logics may or may not have stored it. Nobody can look it up by API.` The time is when the send started (`claimed_at`, else `created_at`). |
| Failed body | Title `Re-send this file?`; text `This file failed to send ({error_detail}). Re-send creates a new attempt with the same bytes.` (falls back to the error code). |
| `I checked Logics — it's there` | Only for `unknown`. An optional `CaseDocumentID (optional)` input with `inputMode="numeric"`; anything other than a positive whole number shows `Enter the number only, like 128346.` and disables the action. Calls `resolve` with `mark_sent`, adding `logics_document_id` only when a number was typed. Consequence line: `Marks this file as sent.` Success toast: `Marked as sent`. |
| `Re-send` | Calls `resolve` with `resend`. For `unknown` the consequence line is `Re-send may create a duplicate in Logics if the first upload did arrive.` Success toast: `Re-send queued`. |
| Errors | A destructive `Alert` with `PUSH_ERROR_COPY` (`not_resolvable` → `This file was already resolved. Refresh to see its state.`) or `GENERIC_ERROR`. |

There are exactly two decisions and `Cancel`. No automatic retry, no "retry all", and no discard option exist anywhere in the UI.

## Tests

`resolve-unknown-dialog.test.tsx` (`web` project; `resolvePush` and `sonner` mocked): title and the three body sentences; buttons are exactly `I checked Logics — it's there`, `Re-send`, `Cancel` (plus Radix's `Close`), and `Cancel` has focus; typing `128346` sends `{ action: 'mark_sent', logics_document_id: 128346 }`; an empty field sends `{ action: 'mark_sent' }`; `Re-send` sends `{ action: 'resend' }`; a failed row hides the first action and shows the failure sentence; `not_resolvable` shows its alert.
