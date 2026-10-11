import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeReturnNonce } from '../db/bank'
import { recordConnectionEvent, setConnectionStatus } from '../db/connections'
import { app } from '../index'

vi.mock('../db/bank')
vi.mock('../db/connections')

const send = vi.fn()
const fetchAsset = vi.fn(async () => new Response('<html>spa</html>', { headers: { 'content-type': 'text/html' } }))
const env = { JOBS: { send }, ASSETS: { fetch: fetchAsset } } as unknown as Env
const get = (path: string) => app.request(path, { redirect: 'manual' }, env)
const NONCE = 'abcdefghijklmnopqrstuv'

beforeEach(() => vi.clearAllMocks())

describe('GET /c/return', () => {
  it('a live nonce enqueues one reconcile, logs connection.returned and redirects', async () => {
    vi.mocked(consumeReturnNonce).mockResolvedValue('C1')
    const res = await get(`/c/return?nonce=${NONCE}`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/c/return')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ type: 'reconcile', ref: 'C1' })
    expect(recordConnectionEvent).toHaveBeenCalledWith(env, 'C1', 'connection.returned', {}, { type: 'client' })
  })
  it('an unknown or used nonce redirects with no job', async () => {
    vi.mocked(consumeReturnNonce).mockResolvedValue(null)
    const res = await get(`/c/return?nonce=${NONCE}`)
    expect(res.status).toBe(302)
    expect(send).not.toHaveBeenCalled()
    expect(recordConnectionEvent).not.toHaveBeenCalled()
  })
  it('a badly shaped nonce never reaches the database', async () => {
    const res = await get('/c/return?nonce=../etc')
    expect(res.status).toBe(302)
    expect(consumeReturnNonce).not.toHaveBeenCalled()
  })
  it('no nonce serves the SPA', async () => {
    const res = await get('/c/return')
    expect(res.status).toBe(200)
    expect(fetchAsset).toHaveBeenCalledTimes(1)
    expect(await res.text()).toContain('spa')
  })
  it('serves the SPA with the client CSP when the asset response headers are immutable', async () => {
    const asset = new Response('<html>spa</html>', { headers: { 'content-type': 'text/html' } })
    for (const m of ['set', 'append', 'delete'] as const)
      vi.spyOn(asset.headers, m).mockImplementation(() => {
        throw new TypeError('immutable')
      })
    fetchAsset.mockResolvedValueOnce(asset)
    // a non-local host, since clientCsp skips localhost
    const res = await app.request('https://resspark.test/c/return', {}, { ...env, SUPABASE_URL: 'https://p.supabase.co' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toContain('cdn.truv.com')
  })
  it('never writes connection status', async () => {
    vi.mocked(consumeReturnNonce).mockResolvedValue('C1')
    await get(`/c/return?nonce=${NONCE}`)
    await get('/c/return')
    expect(setConnectionStatus).not.toHaveBeenCalled()
  })
})
