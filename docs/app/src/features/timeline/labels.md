# `app/src/features/timeline/labels.ts`

Turns an `events.action` name and its JSON payload into one plain-language sentence for the case timeline (Plan 03-05; D-10, STAT-04).

| Part | What it does |
|------|--------------|
| `Payload` | The event's `payload` column as a loose object. Nothing in it is trusted to be a string. |
| `text(v)` | Returns `v` when it is a string, else `''`. Every payload value goes through it, so an object or number is never interpolated into a label. |
| `ACTION_LABELS` | The action-to-label table. Each entry is a function of the payload. |
| `staff.signed_in` / `staff.signed_out` | `Signed in` / `Signed out` (Phase 1, `admin-session.ts`). |
| `case.looked_up` | `Looked up the case` (Phase 2 lookup). |
| `request.created`, `request.sent`, `request.link_copied`, `request.email_sent`, `request.link_regenerated`, `request.revoked` | `Created the request`, `Sent the link`, `Copied the link`, `Emailed the link`, `Made a new link`, `Revoked the link` (Phase 2 send/link routes and migration `0003`). The plan named the email event `request.emailed`; the Worker actually writes `request.email_sent`, so that is the key. |
| `consent.sms` | `Recorded text-message consent`. |
| `request.opened` | `Client opened the link`. |
| `document.uploaded` | `Client uploaded a photo` when `payload.mime_type` starts with `image/`, else `Client uploaded a PDF` (the only other accepted type). Written by the `0004` upload RPC. |
| `document.viewed` | `Downloaded a file` when `payload.disposition` is `attachment`, else `Previewed a file`. |
| `item.approved` | `Approved {label}`; `Approved an item` if the label is missing or not a string. |
| `item.rejected` | `Rejected {label}`, plus ` — {note}` when the payload has a string note. |
| `integration.logics.tested` | `Tested the Logics connection`. |
| `actionLabel(action, payload)` | Looks the action up in the table. An unknown action renders as its own name with every `.` and `_` replaced by a space (`provider.plaid.item_added` → `provider plaid item added`), so Phase 4 provider events and Phase 5 `logics.*` events show up without a code change. |

Actions not in the table today (they use the fallback): `request.email_failed`, `connection.refresh_requested`, `webhook.rejected`, `logics.push_*`, `logics.activity_*`, `job.*`.

Tests: `labels.test.ts` covers each mapped sentence, the fallback, and a non-string payload value.
