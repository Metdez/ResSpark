# `app/src/features/client-portal/use-heartbeat.ts`

`useHeartbeat({ enabled, lastStep, lastError })`: tells the Worker where the client is, so Phase 3's staff mirror view can show "last seen" and the step the client is on (D-12). It posts through `heartbeat()` in `portal-api.ts`, which upserts `client_sessions` on the Worker.

## How it works

- `uaClass()`: `phone` when `(max-width: 767px)` matches, `tablet` when `(max-width: 1023px)` matches, otherwise `desktop`. Only this coarse class is sent, never the user-agent string.
- One `useEffect` keyed on `[enabled, lastStep, lastError]`:
  - When `enabled` is false it does nothing.
  - Otherwise it sends at once, then every 30 s (`setInterval(…, 30_000)`).
  - `send` does nothing while `document.visibilityState` is not `'visible'`, so a backgrounded tab sends nothing.
  - When `heartbeat()` reports `'rate_limited'` (the Worker allows 10 per minute per link), `skipNext` makes the next tick a no-op. `'failed'` is ignored.
  - A change of `lastStep` or `lastError` re-runs the effect: the old interval is cleared and a heartbeat goes out at once with the new values.
  - Cleanup clears the interval, so unmounting (or a 401 that swaps the page) stops it.
- Plain effect, no React Query: nothing reads the response.

## Payload rules (D-12, PLAT-08)

`last_step` is a step kind, `list`, or `intro` (set by `PortalPage`). `last_error` is typed as the fixed codes `state_failed` or `start_failed`; no free text, URL, or form value is ever sent. The Worker caps both lengths as well.

## Tests

`use-heartbeat.test.ts` (fake timers, stubbed `fetch`, `matchMedia`, and `visibilityState`): the immediate post with the device class and CSRF header, a second post at exactly 30 000 ms, no post on a hidden tick, an immediate post on a step change, the error code, nothing when disabled, the skipped tick after a 429, and no posts after unmount.
