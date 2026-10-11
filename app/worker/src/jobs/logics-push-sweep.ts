import { createAdminClient } from '../db/client'
import type { LogicsPushJob } from './logics-push'

// D-03 / Pitfall 3: `sending` rows claimed over 10 minutes ago become `unknown` (consumer_lost);
// `queued` rows idle over 5 minutes are re-enqueued. Re-enqueue is safe: the claim is state-guarded,
// so a duplicate message for a row that is no longer `queued` is just acked.
export async function logicsPushSweep(env: Env): Promise<{ swept: number; requeued: number }> {
  const { data, error } = await createAdminClient(env).rpc('logics_push_sweep')
  if (error) throw new Error('logics_sweep_failed')
  const { swept, requeue } = data as { swept: number; requeue: string[] }
  for (const ref of requeue) await env.JOBS.send({ type: 'logics_push', provider: 'logics', ref } satisfies LogicsPushJob)
  return { swept, requeued: requeue.length }
}
