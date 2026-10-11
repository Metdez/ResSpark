# `app/worker/src/jobs/logics-push-sweep.test.ts`

Unit tests for `logicsPushSweep`. `../db/client` is mocked so `createAdminClient().rpc` returns what each case sets; `env.JOBS.send` is a spy.

- `{ swept: 2, requeue: ['a', 'b'] }` → `rpc('logics_push_sweep')`, two `logics_push` messages with refs `a` and `b`, result `{ swept: 2, requeued: 2 }`.
- An RPC error → rejects with `logics_sweep_failed` and sends nothing.
