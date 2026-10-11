import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listNonTerminalConnections, recordConnectionEvent, updateConnection, type ConnectionRow } from '../db/connections'
import { getWebhookEvent, markWebhookEvent, type WebhookEventRow } from '../db/webhook-events'
import { ProviderError } from '../integrations/provider-error'
import { NonRetryableError, queue, retryDelaySeconds, type Job } from './index'
import { connectionIdForWebhook, reconcileConnection } from './reconcile'
import { removeItem } from './remove-items'

vi.mock('../db/webhook-events', () => ({ getWebhookEvent: vi.fn(), markWebhookEvent: vi.fn() }))
vi.mock('../db/connections', () => ({
  listNonTerminalConnections: vi.fn(),
  recordConnectionEvent: vi.fn(),
  updateConnection: vi.fn(),
}))
vi.mock('./reconcile', () => ({ reconcileConnection: vi.fn(), connectionIdForWebhook: vi.fn() }))
vi.mock('./remove-items', () => ({ removeItem: vi.fn() }))

const env = {} as Env
const MAIN = 'resspark-jobs'

const message = (body: unknown, attempts = 1) => ({ id: 'm1', timestamp: new Date(), body, attempts, ack: vi.fn(), retry: vi.fn() })
const run = async (queueName: string, body: unknown, attempts = 1) => {
  const m = message(body, attempts)
  await queue({ queue: queueName, messages: [m] } as unknown as MessageBatch<Job>, env)
  return m
}
const event = (status: WebhookEventRow['status'] = 'queued'): WebhookEventRow => ({
  id: 'E1',
  provider: 'truv',
  event_key: 'wh_1',
  payload: { order_id: 'ord_1' },
  status,
  attempts: 0,
  last_error: null,
  received_at: '2026-10-11T00:00:00Z',
})
const webhookJob: Job = { type: 'webhook', provider: 'truv', ref: 'E1' }

describe('queue consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getWebhookEvent).mockResolvedValue(event())
    vi.mocked(markWebhookEvent).mockResolvedValue()
    vi.mocked(updateConnection).mockResolvedValue()
    vi.mocked(recordConnectionEvent).mockResolvedValue()
    vi.mocked(connectionIdForWebhook).mockResolvedValue('C1')
    vi.mocked(reconcileConnection).mockResolvedValue({ status: 'done', applied: true })
    vi.mocked(listNonTerminalConnections).mockResolvedValue([])
  })

  it('processes a webhook, acks once and marks the ledger processing then done', async () => {
    const m = await run(MAIN, webhookJob)
    expect(m.ack).toHaveBeenCalledTimes(1)
    expect(m.retry).not.toHaveBeenCalled()
    expect(vi.mocked(markWebhookEvent).mock.calls.map((c) => c[2])).toEqual(['processing', 'done'])
    expect(reconcileConnection).toHaveBeenCalledWith(env, 'C1', { source: 'webhook', hint: { order_id: 'ord_1' } })
    expect(updateConnection).toHaveBeenCalledWith(env, 'C1', { last_webhook_at: expect.any(String) })
  })

  it('retries a transient provider error with exponential backoff and never acks', async () => {
    vi.mocked(reconcileConnection).mockRejectedValue(new ProviderError('truv', 503, 'http_503', true))
    const first = await run(MAIN, webhookJob, 1)
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 120 })
    expect(first.ack).not.toHaveBeenCalled()
    const second = await run(MAIN, webhookJob, 2)
    expect(second.retry).toHaveBeenCalledWith({ delaySeconds: 240 })
    const late = await run(MAIN, webhookJob, 20)
    expect(late.retry).toHaveBeenCalledWith({ delaySeconds: 86400 })
  })

  it('caps retryDelaySeconds at 24 hours', () => {
    expect(retryDelaySeconds(1)).toBe(120)
    expect(retryDelaySeconds(2)).toBe(240)
    expect(retryDelaySeconds(20)).toBe(86_400)
  })

  it('acks a non-retryable failure and marks the ledger row dead with its code', async () => {
    vi.mocked(reconcileConnection).mockRejectedValue(new NonRetryableError('bad'))
    const m = await run(MAIN, webhookJob)
    expect(m.ack).toHaveBeenCalledTimes(1)
    expect(m.retry).not.toHaveBeenCalled()
    expect(markWebhookEvent).toHaveBeenLastCalledWith(env, 'E1', 'dead', 'bad')
  })

  it('records job.failed on the connection when a reconcile job fails permanently', async () => {
    vi.mocked(reconcileConnection).mockRejectedValue(new ProviderError('truv', 404, 'http_404', false))
    const m = await run(MAIN, { type: 'reconcile', ref: 'C9' })
    expect(recordConnectionEvent).toHaveBeenCalledWith(env, 'C9', 'job.failed', { type: 'reconcile', code: 'http_404' })
    expect(m.ack).toHaveBeenCalledTimes(1)
  })

  it('replays an already-done event as a no-op', async () => {
    vi.mocked(getWebhookEvent).mockResolvedValue(event('done'))
    const m = await run(MAIN, webhookJob)
    expect(reconcileConnection).not.toHaveBeenCalled()
    expect(markWebhookEvent).not.toHaveBeenCalled()
    expect(m.ack).toHaveBeenCalledTimes(1)
  })

  it('marks an event with no matching connection ignored', async () => {
    vi.mocked(connectionIdForWebhook).mockResolvedValue(null)
    const m = await run(MAIN, webhookJob)
    expect(markWebhookEvent).toHaveBeenLastCalledWith(env, 'E1', 'ignored', 'no_connection')
    expect(m.ack).toHaveBeenCalledTimes(1)
  })

  it('reconciles every open payroll connection for an unmatched_payroll Truv event', async () => {
    vi.mocked(connectionIdForWebhook).mockResolvedValue('unmatched_payroll')
    vi.mocked(listNonTerminalConnections).mockResolvedValue([{ id: 'P1' }, { id: 'P2' }] as ConnectionRow[])
    const m = await run(MAIN, webhookJob)
    expect(listNonTerminalConnections).toHaveBeenCalledWith(env, 'payroll', 20)
    expect(vi.mocked(reconcileConnection).mock.calls.map((c) => c[1])).toEqual(['P1', 'P2'])
    expect(markWebhookEvent).toHaveBeenLastCalledWith(env, 'E1', 'done')
    expect(m.ack).toHaveBeenCalledTimes(1)
  })

  it('a resspark-jobs-dlq webhook message marks the ledger row dead (dead_lettered) and acks', async () => {
    const m = await run('resspark-jobs-dlq', webhookJob)
    expect(markWebhookEvent).toHaveBeenCalledWith(env, 'E1', 'dead', 'dead_lettered')
    expect(reconcileConnection).not.toHaveBeenCalled()
    expect(m.ack).toHaveBeenCalledTimes(1)
  })

  it('a dead-lettered reconcile job writes job.dead_lettered and acks', async () => {
    const m = await run('resspark-jobs-dlq', { type: 'reconcile', ref: 'C9' })
    expect(recordConnectionEvent).toHaveBeenCalledWith(env, 'C9', 'job.dead_lettered', { type: 'reconcile' })
    expect(m.ack).toHaveBeenCalledTimes(1)
  })

  it('acks an unknown job type without throwing', async () => {
    const m = await run(MAIN, { type: 'nope', ref: 'X' })
    expect(m.ack).toHaveBeenCalledTimes(1)
    expect(m.retry).not.toHaveBeenCalled()
  })

  it('remove_item calls removeItem and acks', async () => {
    const m = await run(MAIN, { type: 'remove_item', ref: 'C9' })
    expect(removeItem).toHaveBeenCalledWith(env, 'C9')
    expect(m.ack).toHaveBeenCalledTimes(1)
  })

  it('remove_item retries on a transient ProviderError', async () => {
    vi.mocked(removeItem).mockRejectedValueOnce(new ProviderError('plaid', 503, 'http_503', true))
    const m = await run(MAIN, { type: 'remove_item', ref: 'C9' })
    expect(m.retry).toHaveBeenCalledTimes(1)
    expect(m.ack).not.toHaveBeenCalled()
  })

  it('logs only job, attempt and error_code', async () => {
    vi.mocked(reconcileConnection).mockRejectedValue(new Error('Postgres said: secret detail'))
    await run(MAIN, webhookJob, 3)
    // eslint-disable-next-line no-console -- reading the spied log line
    const line = vi.mocked(console.error).mock.calls[0][0] as string
    expect(JSON.parse(line)).toEqual({ job: 'webhook', attempt: 3, error_code: 'internal' })
  })
})
