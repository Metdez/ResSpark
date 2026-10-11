# `app/src/lib/status.ts`

One place that turns a request or item status into a badge tone and a label. Every status badge in the SPA reads from here, so the colors and words stay identical across the request page, the requests list (Plan 06), and the client portal (Plan 08).

| Part | What it does |
|------|--------------|
| `Tone` | The six palette tones from the UI-SPEC "Status badge palette — Inherited": `neutral`, `info`, `warning`, `success`, `destructive`, `muted`. |
| `TONE_CLASSES` | The Tailwind class string for each tone, copied verbatim from the UI-SPEC (light classes, then the `dark:` classes). |
| `Badge` (local type) | `{ tone, label }`, the shape both functions return and `StatusBadge` takes as props. |
| `REQUEST` | Request statuses from D-06 (`draft`, `sent`, `opened`, `in_progress`, `waiting_on_staff`, `complete`, `revoked`) to the staff labels `Draft`, `Sent`, `Opened`, `In progress`, `Waiting on staff`, `Complete`, `Revoked`. |
| `ITEM.staff` | Item statuses (`pending`, `in_progress`, `submitted`, `approved`, `rejected`) to `Not started`, `In progress`, `Needs review`, `Approved`, `Rejected`. |
| `ITEM.client` | The same statuses in client words: a submitted item is still `In progress` to the client (they never see "review"), `approved` is `Done`, `rejected` is `Needs attention`. |
| `fallback` | An unknown status renders as a neutral badge with its raw value, so a status added later never shows a blank badge. |
| `requestStatusBadge(status)` | Looks up `REQUEST`, else the fallback. |
| `itemStatusBadge(status, audience)` | Looks up `ITEM[audience]`, else the fallback. |

## Tests

`status.test.ts` (`web` project): every request status, every item status for both audiences, the unknown-status fallback for both functions, and the exact `info`, `success`, and `neutral` class strings.
