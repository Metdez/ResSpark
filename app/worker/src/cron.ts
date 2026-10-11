import { setConnectionStatus } from './db/connections'
import {
  expireStalePendingBank,
  listRemovalCandidates,
  listStaleConnections,
  listStuckWebhookEvents,
} from './db/connections-ops'
import { logEvent } from './db/events'
import { defaultFirmId } from './db/webhook-events'
import type { Job } from './jobs/index'

export const DAILY_CRON = '0 3 * * *'
const BATCH = 100 // Queues sendBatch limit

// One failing step must not stop the others; only our own snake_case tokens reach the log.
async function step<T>(fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ route: 'cron', error_code: 'cron_step_failed' }))
    return fallback
  }
}

async function enqueue(env: Env, jobs: Job[]): Promise<void> {
  for (let i = 0; i < jobs.length; i += BATCH) {
    await env.JOBS.sendBatch(jobs.slice(i, i + BATCH).map((body) => ({ body })))
  }
}

// D-04 / WEBH-02: every 15 minutes. Jobs go through the same consumer and reconcileConnection
// as webhooks, so a cron reconcile racing a webhook converges through connection_set_status.
export async function reconcileTick(env: Env): Promise<{ requeued: number; reconciles: number; expired: number }> {
  const stuck = await step([], () => listStuckWebhookEvents(env))
  const stale = await step([], () => listStaleConnections(env))
  const jobs: Job[] = [
    ...stuck.map((e): Job => ({ type: 'webhook', provider: e.provider, ref: e.id })),
    ...stale.map((ref): Job => ({ type: 'reconcile', ref })),
  ]
  const sent = await step(false, async () => {
    await enqueue(env, jobs)
    return true
  })
  const expired = await step(0, async () => {
    let n = 0
    for (const id of await expireStalePendingBank(env)) {
      await setConnectionStatus(env, id, 'error', { code: 'link_expired' })
      n += 1
    }
    return n
  })
  return { requeued: sent ? stuck.length : 0, reconciles: sent ? stale.length : 0, expired }
}

// D-13 / BANK-06: daily at 03:00 UTC; the consumer's remove_item job does the vendor call.
export async function dailyJobs(env: Env): Promise<{ removals: number }> {
  const due = await step([], () => listRemovalCandidates(env))
  const sent = await step(false, async () => {
    await enqueue(env, due.map((ref): Job => ({ type: 'remove_item', ref })))
    return true
  })
  return { removals: sent ? due.length : 0 }
}

export async function scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
  const start = Date.now()
  const daily = controller.cron === DAILY_CRON
  const counts = daily ? await dailyJobs(env) : await reconcileTick(env)
  // The logger allowlist has no count fields, so the counts go to one firm-level event per run.
  await step(0, async () =>
    logEvent(env, {
      firm_id: await defaultFirmId(env),
      actor_type: 'system',
      action: daily ? 'cron.daily' : 'cron.tick',
      payload: counts,
    })
  )
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ route: 'cron', status: 200, duration_ms: Date.now() - start }))
}
