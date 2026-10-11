import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRequests } from './api'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

const ROW = {
  id: 'r1',
  case_id: 'c1',
  status: 'sent',
  template_name: 'Documents only',
  agent_display_name: null,
  client_name: 'Jordan Rivera',
  first_name: 'Jordan',
  last_name: 'Rivera',
  email: null,
  created_at: '2026-10-01T00:00:00Z',
  sent_at: null,
  opened_at: null,
  completed_at: null,
  expires_at: null,
  last_activity_at: null,
  overdue: false,
}

function reply(body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fetchRequests', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends only the filters that are set', async () => {
    const f = reply({ requests: [ROW] })
    await expect(fetchRequests({})).resolves.toEqual({ requests: [ROW] })
    await fetchRequests({ status: 'sent', q: 'Ann Lee' })
    expect(f.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      '/api/admin/requests',
      '/api/admin/requests?status=sent&q=Ann+Lee',
    ])
  })

  it('rejects a row without client_name or with a non-boolean overdue', async () => {
    const { client_name: _, ...nameless } = ROW
    reply({ requests: [nameless] })
    await expect(fetchRequests({})).rejects.toThrow()
    reply({ requests: [{ ...ROW, overdue: 'yes' }] })
    await expect(fetchRequests({})).rejects.toThrow()
  })
})
