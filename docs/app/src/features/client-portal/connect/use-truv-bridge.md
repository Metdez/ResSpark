# `app/src/features/client-portal/connect/use-truv-bridge.ts`

Loads the payroll provider's Bridge script on demand (D-05). The portal bundle never contains it; the script is injected only when the client taps Connect.

- `TruvBridgeApi`: the part of `window.TruvBridge` the portal uses: `init({ isOrder: true, bridgeToken, onEvent?(type, payload, source), onClose?, onLoad? })`, returning `{ open(), close() }`.
- The `declare global` block adds the optional `TruvBridge` property to `Window`.
- `SRC`: `https://cdn.truv.com/bridge.js`, the only place the URL appears in the portal.
- `loading`: the in-flight load promise, shared so concurrent calls add one script.
- `loadTruvBridge()`:
  - Resolves at once if `window.TruvBridge` already exists.
  - Otherwise appends one `<script src=SRC async>` to `<head>`.
  - On `load` it resolves with `window.TruvBridge`, or rejects `Error('bridge_load_failed')` if the global is missing.
  - On `error` it rejects `bridge_load_failed` and removes the script tag, so a later tap retries with a fresh tag.
  - `loading` is cleared when the promise settles either way, so the next call checks `window.TruvBridge` again.

The portal CSP (Plan 04-03) allows this script origin and the Bridge frame.

## Tests

See `use-truv-bridge.test.md`.
