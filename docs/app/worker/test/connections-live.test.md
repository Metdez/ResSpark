# `app/worker/test/connections-live.test.ts`

WEBH-03 proven live: the rank matrix of `connection_set_status` (migration 0005), driven directly through `admin.rpc` against the Supabase project and read back with the admin client. Runs in `pnpm -C app test:live`; skips with a printed reason when `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing.

## Setup

- Two payroll fixtures from `fixtures/connections.ts` (test firm `...000e`): the main one, and one whose item staff "approved".
- `newConnection(f)` inserts a `pending` Truv payroll connection on a fixture's item.
- `set(id, status, detail)` calls the RPC and throws the Postgres message on error (so `rejects.toThrow(/bad_status/)` works).
- `row(id)` reads the connection; `events(id, action?)` reads events whose `payload->>connection_id` is the connection.
- `afterAll` cleans both fixtures (events stay; append-only, test firm).

## Matrix (17 tests)

| From | To | Expected |
|------|----|----------|
| pending | connected | applied; item `submitted`; `connected_at` set; one `connection.connected` event |
| connected | syncing | applied |
| syncing | done | applied; `completed_at` set; request `waiting_on_staff` |
| done | pending | not applied; row stays `done`; no new event |
| done | connected | not applied |
| done | done | applied (idempotent); no new event; still one `connection.done` |
| done | error | not applied; `error` stays NULL (a stale error never undoes completion) |
| pending | error `{ code: 'x' }` | applied; detail stored |
| error | pending | not applied |
| error | error `{ code: 'y' }` | applied; `error.code = 'y'`; two `connection.error` events |
| error | connected | applied (repairable); `error` cleared |
| connected | removed, then removed → done | applied with `removed_at`; then not applied (terminal) |
| any | `finished` | RPC error `bad_status` |
| random uuid | done | RPC error `connection_not_found` |
| pending (item `approved`) | connected | applied; item stays `approved` |
| pending | `Promise.all(connected, syncing)` | both resolve; final row `syncing` (the `FOR UPDATE` locks serialize them; which call reports `applied` may vary) |

Plus `connection_record_event(id, 'test.event', { a: 1 })` writes one event whose payload is exactly `{ a: 1, connection_id }`.
