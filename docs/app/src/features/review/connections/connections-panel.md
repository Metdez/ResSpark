# `app/src/features/review/connections/connections-panel.tsx`

The `Connections` section of the staff request page (Plan 04-06; D-04, PAY-04). `request-page.tsx` mounts it directly above the Phase 3 `ReviewPanel` once the request has been sent.

| State | What renders |
|-------|--------------|
| Loading (no data yet, no error) | Three `Skeleton` rows (`data-skeleton`), the UI-SPEC loading pattern. |
| Error (no data) | A destructive `Alert`: `Couldn't load the connections`, the generic staff sentence, the error code in 14 px muted text, and a `Retry` button. |
| Empty list | The inherited empty block: `No connections yet` centred in a dashed `min-h-60` box. |
| Connections | One `ConnectionCard` per connection, in server order (newest first). |

The section heading is an `h2` labelled `Connections`, and the `section` points at it with `aria-labelledby`. Data comes from `useConnections(requestId)` (5 s `pollInterval`, previous data kept between polls), so a client finishing a connection shows up within seconds. Because `keepPreviousData` is on, a failed poll after a success keeps the last cards on screen instead of the error block.
