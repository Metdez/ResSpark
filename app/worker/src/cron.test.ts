import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DAILY_CRON, dailyJobs, reconcileTick, scheduled } from './cron'
import { setConnectionStatus } from './db/connections'
import {
  expireStalePendingBank,
  listRemovalCandidates,
  listStaleConnections,
  listStuckWebhookEvents,
} from './db/connections-ops'
import { logEvent } from './db/events'

vi.mock('./db/connections-ops', () => ({
  listStaleConnections: vi.fn(),
  listStuckWebhookEvents: vi.fn(),
  expireStalePendingBank: vi.fn(),
  listRemovalCandidates: vi.fn(),
}))
vi.mock('./db/connections', () => ({ setConnectionStatus: vi.fn() }))
vi.mock('./db/webhook-events', () => ({ defaultFirmId: vi.fn(async () => 'F1') }))
vi.mock('./db/events', () => ({ logEvent: vi.fn(async () => 1) }))

const send = vi.fn()
const sendBatch = vi.fn()
const env = { JOBS: { send, sendBatch } } as unknown as Env
const bodies = (call = 0) => (sendBatch.mock.calls[call][0] as Array<{ body: unknown }>).map((m) => m.body)
const controller = (cron: string) => ({ cron, scheduledTime: Date.now(), noRetry: vi.fn() }) as unknown as ScheduledController
const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(listStuckWebhookEvents).mockResolvedValue([])
  vi.mocked(listStaleConnections).mockResolvedValue([])
  vi.mocked(expireStalePendingBank).mockResolvedValue([])
  vi.mocked(listRemovalCandidates).mockResolvedValue([])
  vi.mocked(setConnectionStatus).mockResolvedValue({ applied: true, status: 'error', item_status: null, request_status: null })
})

describe('reconcileTick', () => {
  it('re-enqueues stuck webhooks first, then stale connections, in one batch', async () => {
    vi.mocked(listStuckWebhookEvents).mockResolvedValue([{ id: 'E1', provider: 'truv' }])
    vi.mocked(listStaleConnections).mockResolvedValue(['C1', 'C2'])
    await expect(reconcileTick(env)).resolves.toEqual({ requeued: 1, reconciles: 2, expired: 0 })
    expect(sendBatch).toHaveBeenCalledTimes(1)
    expect(bodies()).toEqual([
      { type: 'webhook', provider: 'truv', ref: 'E1' },
      { type: 'reconcile', ref: 'C1' },
      { type: 'reconcile', ref: 'C2' },
    ])
  })

  it('sends nothing when there is nothing to do', async () => {
    await expect(reconcileTick(env)).resolves.toEqual({ requeued: 0, reconciles: 0, expired: 0 })
    expect(sendBatch).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('expires a dead Hosted Link session through the status RPC', async () => {
    vi.mocked(expireStalePendingBank).mockResolvedValue(['C9'])
    await expect(reconcileTick(env)).resolves.toMatchObject({ expired: 1 })
    expect(setConnectionStatus).toHaveBeenCalledWith(env, 'C9', 'error', { code: 'link_expired' })
  })

  it('keeps going when one step throws', async () => {
    vi.mocked(listStaleConnections).mockRejectedValue(new Error('connection_list_failed'))
    vi.mocked(expireStalePendingBank).mockResolvedValue(['C9'])
    await expect(reconcileTick(env)).resolves.toEqual({ requeued: 0, reconciles: 0, expired: 1 })
    expect(setConnectionStatus).toHaveBeenCalledTimes(1)
  })

  it('sends more than 100 jobs in chunks of 100', async () => {
    vi.mocked(listStaleConnections).mockResolvedValue(Array.from({ length: 150 }, (_, i) => `C${i}`))
    await reconcileTick(env)
    expect(sendBatch).toHaveBeenCalledTimes(2)
    expect(bodies(0)).toHaveLength(100)
    expect(bodies(1)).toHaveLength(50)
    expect(bodies(1)[49]).toEqual({ type: 'reconcile', ref: 'C149' })
  })
})

describe('dailyJobs', () => {
  it('dispatches due Item removals', async () => {
    vi.mocked(listRemovalCandidates).mockResolvedValue(['C3'])
    await expect(dailyJobs(env)).resolves.toEqual({ removals: 1 })
    expect(bodies()).toEqual([{ type: 'remove_item', ref: 'C3' }])
  })

  it('is a no-op with nothing due', async () => {
    await expect(dailyJobs(env)).resolves.toEqual({ removals: 0 })
    expect(sendBatch).not.toHaveBeenCalled()
  })

  it('swallows a failing candidate query', async () => {
    vi.mocked(listRemovalCandidates).mockRejectedValue(new Error('connection_list_failed'))
    await expect(dailyJobs(env)).resolves.toEqual({ removals: 0 })
  })
})

describe('scheduled', () => {
  it('runs the daily step on the 03:00 trigger only', async () => {
    vi.mocked(listRemovalCandidates).mockResolvedValue(['C3'])
    await scheduled(controller(DAILY_CRON), env, ctx)
    expect(listRemovalCandidates).toHaveBeenCalledTimes(1)
    expect(listStaleConnections).not.toHaveBeenCalled()
    expect(logEvent).toHaveBeenCalledWith(env, expect.objectContaining({ firm_id: 'F1', action: 'cron.daily', payload: { removals: 1 } }))
  })

  it('runs the reconciler on the 15-minute trigger only', async () => {
    await scheduled(controller('*/15 * * * *'), env, ctx)
    expect(listStaleConnections).toHaveBeenCalledTimes(1)
    expect(listRemovalCandidates).not.toHaveBeenCalled()
    expect(logEvent).toHaveBeenCalledWith(env, expect.objectContaining({ action: 'cron.tick' }))
  })

  it('logs only allowlisted fields', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await scheduled(controller('*/15 * * * *'), env, ctx)
    const line = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(Object.keys(line).sort()).toEqual(['duration_ms', 'route', 'status'])
    expect(line).toMatchObject({ route: 'cron', status: 200 })
  })
})
