# `app/worker/test/events.test.ts`

A live test of the PLAT-04 write path (`logEvent` → `log_event()` → append-only `events`) and of `getStaffProfile`. It runs in the `worker-node` Vitest project through `pnpm -C app run test:live`, which loads `app/.dev.vars`.

| Lines | What it does |
|-------|--------------|
| 1-5 | supabase-js, Vitest, and the three `db/` modules under test. |
| 7-9 | Test rows stay in the table, because `events` is append-only by design. They are filterable by `actor_type = 'system'` and `action = 'test.ping'`. |
| 10-18 | Reads the Supabase URL, secret and publishable keys, and the demo staff credentials. `ready` gates the suite. |
| 20 | `describe.skipIf(!ready)`: plain `pnpm test` reports it as skipped. Under `test:live`, a skip means the env did not load. |
| 21-30 | `env` holds the two secrets the `db/` functions need. `ping` is the shared event input. `a`, `b`, and `demoUserId` carry state between the ordered tests. |
| 32-43 | `beforeAll` signs in as the demo staff user with the publishable key to learn its user id, then signs out. |
| 45-51 | Two identical `logEvent` calls return two numbers with `b > a`: no dedupe or merge. |
| 53-65 | Reads both rows back with the admin client, `order('id', { ascending: false })`. It expects 2 rows, `b` first, `action = 'test.ping'`, `payload.test === true`, and a `created_at` that parses as a date. |
| 67-76 | `logEvent` without `payload` stores `{}`. |
| 78-84 | `update({ action: 'x' })` on row `a` fails with a message containing `events is append-only`. |
| 86-89 | `delete()` on row `a` fails with the same message. |
| 91-98 | An invalid `actor_type` (`'robot'`, cast past the type) violates the CHECK constraint. `logEvent` rejects with exactly `log_event_failed`, so no SQL text leaks. |
| 100-106 | `getStaffProfile` for the demo user returns its own `user_id`, the ValorTax `firm_id`, a role of `admin` or `staff`, and a non-empty `display_name`. |
| 108-110 | `getStaffProfile` for the all-zero uuid returns `null`. |

The tests depend on running in order (`a` and `b` come from the first test), which is Vitest's default within a file.

Result on 2026-10-11: 8 passed, 0 skipped. `events` holds at least 3 `test.ping` rows after one run (3 more per run).
