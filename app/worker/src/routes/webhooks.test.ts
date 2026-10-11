import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signTruv } from '../../test/helpers/truv-sign'
import { logEvent } from '../db/events'
import { recordWebhook } from '../db/webhook-events'
import { app } from '../index'

vi.mock('../db/events', () => ({ logEvent: vi.fn() }))
vi.mock('../db/webhook-events', () => ({ recordWebhook: vi.fn(), defaultFirmId: vi.fn(async () => 'firm-1') }))

const SECRET = 'sandbox-secret'
const BODY = JSON.stringify({ webhook_id: 'wh_unit_1', event_type: 'order-status-updated', order_id: 'ord_1' })

describe('POST /api/webhooks/:provider', () => {
  let send: ReturnType<typeof vi.fn>
  let lines: string[]

  const post = async (provider: string, sig: string | null, over: Record<string, unknown> = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (sig) headers['x-webhook-sign'] = sig
    const env = { TRUV_SECRET: SECRET, JOBS: { send }, ...over } as unknown as Env
    return app.request(`/api/webhooks/${provider}`, { method: 'POST', body: BODY, headers }, env)
  }
  const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

  beforeEach(() => {
    send = vi.fn()
    lines = []
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '))
      })
    }
    vi.mocked(recordWebhook).mockResolvedValue('E1')
    vi.mocked(logEvent).mockResolvedValue(1)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(recordWebhook).mockReset()
    vi.mocked(logEvent).mockReset()
  })

  it('answers 404 not_found for an unknown provider and for prototype keys', async () => {
    for (const p of ['nope', 'constructor']) {
      const res = await post(p, null)
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toContain('application/json')
      expect(await code(res)).toBe('not_found')
    }
  })

  it('answers 401 when the provider secret is not configured, without touching the ledger', async () => {
    const res = await post('truv', await signTruv(SECRET, BODY), { TRUV_SECRET: '' })
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await code(res)).toBe('invalid_signature')
    expect(recordWebhook).not.toHaveBeenCalled()
  })

  it('records a valid Truv delivery and enqueues its id', async () => {
    const res = await post('truv', await signTruv(SECRET, BODY))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ ok: true })
    expect(recordWebhook).toHaveBeenCalledWith(expect.anything(), 'truv', 'wh_unit_1', JSON.parse(BODY))
    expect(send).toHaveBeenCalledWith({ type: 'webhook', provider: 'truv', ref: 'E1' })
  })

  it('answers duplicate: true and enqueues nothing when the ledger already has the event', async () => {
    vi.mocked(recordWebhook).mockResolvedValue(null)
    const res = await post('truv', await signTruv(SECRET, BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, duplicate: true })
    expect(send).not.toHaveBeenCalled()
  })

  it('answers 401 for a bad signature and logs webhook.rejected with { provider } only', async () => {
    const sig = await signTruv('wrong', BODY)
    const res = await post('truv', sig)
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await code(res)).toBe('invalid_signature')
    expect(recordWebhook).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(logEvent).toHaveBeenCalledTimes(1)
    const input = vi.mocked(logEvent).mock.calls[0][1]
    expect(input).toMatchObject({ firm_id: 'firm-1', actor_type: 'provider', action: 'webhook.rejected' })
    expect(input.payload).toEqual({ provider: 'truv' })
    expect(lines.some((l) => l.includes(sig) || l.includes('wh_unit_1'))).toBe(false)
  })

  it('never writes the body or the signature to the console on success', async () => {
    const sig = await signTruv(SECRET, BODY)
    await post('truv', sig)
    expect(lines.length).toBeGreaterThan(0) // the allowlisted request log line
    expect(lines.some((l) => l.includes(sig) || l.includes('wh_unit_1') || l.includes('ord_1'))).toBe(false)
  })
})
