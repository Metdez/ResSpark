import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { fetchConnections, fetchTransactions, isConnectionSummary, refreshConnection, type ConnectionSummary } from './api'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}))

const CONNECTION: ConnectionSummary = {
  id: 'C1',
  request_item_id: 'I1',
  kind: 'bank',
  provider: 'plaid',
  status: 'syncing',
  error: null,
  created_at: '2026-10-10T08:00:00Z',
  last_webhook_at: null,
  last_polled_at: '2026-10-10T09:00:00Z',
  accounts: [],
  transactions: { count: 0, update_status: 'not_ready' },
  employers: [],
}

const fetchMock = vi.fn()
const reply = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))
const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit]

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('connections api', () => {
  it('fetchConnections GETs the request list with the staff Bearer', async () => {
    reply({ connections: [CONNECTION] })
    expect(await fetchConnections('R1')).toEqual({ connections: [CONNECTION] })
    const [url, init] = lastCall()
    expect(url).toBe('/api/admin/requests/R1/connections')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })

  it('rejects a body without connections', async () => {
    reply({ nope: [] })
    await expect(fetchConnections('R1')).rejects.toBeInstanceOf(ApiError)
  })

  it('refreshConnection POSTs the refresh route', async () => {
    reply({ connection: CONNECTION })
    await refreshConnection('C1')
    const [url, init] = lastCall()
    expect(url).toBe('/api/admin/connections/C1/refresh')
    expect(init.method).toBe('POST')
  })

  it('refreshConnection surfaces a 502 code', async () => {
    reply({ error: { code: 'provider_unavailable', message: 'x' } }, 502)
    await expect(refreshConnection('C1')).rejects.toMatchObject({ status: 502, code: 'provider_unavailable' })
  })

  it('fetchTransactions GETs with the months window', async () => {
    reply({ months: 3, total: 0, transactions: [] })
    await fetchTransactions('C1', 3)
    expect(lastCall()[0]).toBe('/api/admin/connections/C1/transactions?months=3')
  })

  it('guard rejects an unknown kind', () => {
    expect(isConnectionSummary(CONNECTION)).toBe(true)
    expect(isConnectionSummary({ ...CONNECTION, kind: 'signature' })).toBe(false)
  })
})
