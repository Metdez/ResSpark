# `app/src/features/client-portal/connect/use-truv-bridge.test.ts`

jsdom tests for `loadTruvBridge`. `scripts()` lists the `<script>` tags whose `src` is the Bridge URL; `afterEach` removes them and deletes `window.TruvBridge`.

1. Nothing is injected before the first call.
2. Two calls append one `async` script; after `window.TruvBridge` is set and `load` fires, both promises resolve with that object.
3. `error` rejects with `bridge_load_failed` and removes the tag; the next call appends a new tag (its rejection is caught so the test leaves no unhandled promise).
