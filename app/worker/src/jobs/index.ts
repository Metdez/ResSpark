import { listNonTerminalConnections, recordConnectionEvent, updateConnection } from '../db/connections'
import { getWebhookEvent, markWebhookEvent } from '../db/webhook-events'
import { NonRetryableError, ProviderError } from '../integrations/provider-error'
import { handleLogicsPushPart, type LogicsPushJob } from './logics-push'
import { connectionIdForWebhook, reconcileConnection } from './reconcile'

export { NonRetryableError } from '../integrations/provider-error'

// Queue messages carry ids only (128 KB limit, no secrets); everything else is re-read.
export type Job =
  | { type: 'webhook'; provider: 'plaid' | 'truv'; ref: string }
  | { type: 'reconcile'; ref: string }
  | { type: 'remove_item'; ref: string }
  | LogicsPushJob

const DLQ = 'resspark-jobs-dlq'
const UNMATCHED_LIMIT = 20

// 60·2^attempts seconds, capped at the Queues per-message maximum of 24 h.
export const retryDelaySeconds = (attempts: number) => Math.min(60 * 2 ** attempts, 86_400)

// Our own thrown tokens only; any other message could carry vendor or Postgres text.
const codeOf = (e: unknown) => {
  if (e instanceof ProviderError || e instanceof NonRetryableError) return e.code
  return e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : 'internal'
}

// Allowlisted fields only (Phase 1 D-20): job type, attempt, error code.
function log(level: 'warn' | 'error', job: string, attempt: number, errorCode: string): void {
  // eslint-disable-next-line no-console
  console[level](JSON.stringify({ job, attempt, error_code: errorCode }))
}

async function runWebhook(env: Env, ref: string): Promise<void> {
  const event = await getWebhookEvent(env, ref)
  if (!event) throw new NonRetryableError('event_missing')
  if (event.status === 'done' || event.status === 'ignored' || event.status === 'dead') return // replay
  await markWebhookEvent(env, ref, 'processing')
  const target = await connectionIdForWebhook(env, event)
  if (target === null) return markWebhookEvent(env, ref, 'ignored', 'no_connection')
  if (target === 'unmatched_payroll') {
    for (const conn of await listNonTerminalConnections(env, 'payroll', UNMATCHED_LIMIT)) {
      await reconcileConnection(env, conn.id, { source: 'webhook' })
    }
  } else {
    await reconcileConnection(env, target, { source: 'webhook', hint: event.payload })
    await updateConnection(env, target, { last_webhook_at: new Date().toISOString() })
  }
  await markWebhookEvent(env, ref, 'done')
}

async function runJob(env: Env, job: Job): Promise<void> {
  switch (job.type) {
    case 'webhook':
      return runWebhook(env, job.ref)
    case 'reconcile':
      await reconcileConnection(env, job.ref, { source: 'cron' })
      return
    case 'remove_item':
      throw new NonRetryableError('job_not_available') // Plan 04 wires Item removal
    default:
      throw new NonRetryableError('unknown_job')
  }
}

// D-03: ack after processing; retry with backoff only for transient provider errors; anything
// else is acked and recorded so a poison message never loops. Never throws.
export async function queue(batch: MessageBatch<Job>, env: Env): Promise<void> {
  if (batch.queue === DLQ) {
    for (const m of batch.messages) {
      try {
        if (m.body.type === 'webhook') await markWebhookEvent(env, m.body.ref, 'dead', 'dead_lettered')
        // a dead-lettered push row is still queued; the Phase 5 sweeper re-enqueues it
        else if (m.body.type !== 'logics_push') await recordConnectionEvent(env, m.body.ref, 'job.dead_lettered', { type: m.body.type })
      } catch {
        log('error', String(m.body?.type), m.attempts, 'dlq_record_failed')
      }
      m.ack()
    }
    return
  }
  for (const m of batch.messages) {
    const job = m.body
    // Ack-after-dispatch (D-03): this handler owns ack/retry. The generic retry below must never
    // see a push, or a redelivery could POST the same document to Logics twice.
    if (job.type === 'logics_push') {
      try {
        await handleLogicsPushPart(m as Message<LogicsPushJob>, env)
      } catch (e) {
        log('error', job.type, m.attempts, codeOf(e))
      }
      continue
    }
    try {
      await runJob(env, job)
      m.ack()
    } catch (e) {
      if (e instanceof ProviderError && e.transient) {
        log('warn', job.type, m.attempts, e.code)
        m.retry({ delaySeconds: retryDelaySeconds(m.attempts) })
        continue
      }
      const code = codeOf(e)
      log('error', String(job?.type), m.attempts, code)
      try {
        if (job.type === 'webhook') await markWebhookEvent(env, job.ref, 'dead', code)
        else await recordConnectionEvent(env, job.ref, 'job.failed', { type: job.type, code })
      } catch {
        // the job is acked regardless; the cron reconciler is the backstop
      }
      m.ack()
    }
  }
}
