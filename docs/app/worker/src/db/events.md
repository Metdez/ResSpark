# `app/worker/src/db/events.ts`

The one path by which the Worker writes audit events (D-11, PLAT-04). Every later phase that records an action calls `logEvent`. It never inserts into `events` directly.

| Lines | What it does |
|-------|--------------|
| 1 | Uses the per-request admin client from `./client`. |
| 3 | `ActorType` mirrors the `events.actor_type` CHECK constraint in migration 0002: `staff`, `client`, `system`, `provider`. |
| 5-13 | `EventInput`: `firm_id`, `actor_type`, and `action` are required. `case_id`, `request_id`, `actor_id`, and `payload` are optional. |
| 15-19 | `logEvent(env, input)` takes only the two Supabase secrets from `Env`. |
| 20-29 | Calls `rpc('log_event', { p_firm_id, p_case_id, p_request_id, p_actor_type, p_actor_id, p_action, p_payload })`. The parameter names match `public.log_event(...)` exactly. Missing optional ids become `null`. A missing payload becomes `{}` (PLAT-04 empty edge), matching the column default. `log_event` is executable by `service_role` only, which is the role the secret key runs as. |
| 30-31 | Any error throws `Error('log_event_failed')`. The Postgres message, which can name tables, constraints, or values, is never passed on to callers or logs. |
| 32 | Returns the new `events.id` as a number. The column is `bigint` identity, which PostgREST returns as a JSON number; ids stay far below 2^53. |

## Guarantees (proven live by `app/worker/test/events.test.ts`)

- No dedupe: two identical calls in the same second create two rows, and the second id is greater.
- Order by `id DESC`. `created_at` is for display only.
- `UPDATE` and `DELETE` on `events` fail with `events is append-only` (the trigger from migration 0002), even for `service_role`.
