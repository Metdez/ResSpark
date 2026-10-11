# `app/src/features/client-portal/connect/return-page.tsx`

`ReturnPage()`: what the client sees after the bank sends them back (D-08). It only waits: it never starts a connection, never reads a status from the URL, and never marks anything connected itself. The Worker's `/c/return` handler already queued the reconcile.

## Polling

- `useQuery(['portal', 'state'], getState)`, the same query as `PortalPage`, with `retry: false`.
- `refetchInterval`: every 3 000 ms, stopped (`false`) once the query error is a 401.
- `connected`: some step with `kind === 'bank_connect'` is `submitted` or `approved` (with the agent). When it turns true, an effect shows `toast.success('Bank connected')` and navigates to `/c` with `replace: true`, so Back does not return here. (Shortcut, noted in code: with two bank steps, an already-finished one returns early.)

## Timeout

A `useEffect` timer sets `slow` after 45 000 ms. Polling continues either way.

## Render

- 401 (no or revoked session) → `InvalidLinkPage`.
- Otherwise inside `ClientShell` (firm and agent from the state once loaded; `VITE_APP_NAME`, default `ResSpark`, while loading), in an `aria-live="polite"` region:
  - a spinning `Loader2` (24 px; no spin under reduced motion) and the heading "Checking your connection…" (20 px);
  - "Give us a moment while your bank finishes up." (16 px, muted);
  - when `slow`: "This is taking longer than usual.", "You can go back to your steps — we'll keep checking in the background.", and a 44 px `Back to your steps` button that navigates to `/c`.

All copy is `CONNECT_COPY.return`.

## Tests

See `return-page.test.md`.
