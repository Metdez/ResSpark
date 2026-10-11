# `app/worker/src/routes/c-address.test.ts`

Unit tests for the client address routes (`c-address.ts`). They run in the `worker-node` project with no network.

Setup: `db/case-address` and `db/documents` are auto-mocked. `clientSession` sets a fixed session (link `L1`, request `R1`, firm `F1`). `requireClientHeader` stays real. `fetch` is stubbed per test with the Smarty fixtures under `worker/test/fixtures/smarty/`. `beforeEach` resets the rate window, makes `findSessionItem` return an address item, and makes `confirmAddress` succeed.

`c-address.md` lists every case under Tests. They cover:

- suggest: validation, Smarty keys, mapping, provider errors and the shared rate window;
- confirm: origin, item scope, item kind, body guards, the smarty and manual branches, DPV handling and RPC token mapping;
- Phase 7: the enqueue of `financials_propose` after a confirmation, and a throwing `JOBS.send` that still answers 200.
