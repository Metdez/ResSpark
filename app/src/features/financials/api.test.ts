import { afterEach, describe, expect, it, vi } from 'vitest'
import { decide, getFinancials, isEvaluationResponse, isFinancialsView } from './api'
import { makeView, RUN } from './test-fixtures'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))

function reply(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_path: string, _init: RequestInit) => ({ ok: status < 300, status, json: async () => body }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
afterEach(() => vi.unstubAllGlobals())

describe('financials api', () => {
  it('getFinancials GETs the case view through api()', async () => {
    const fetchMock = reply(makeView())
    const view = await getFinancials('C1')
    expect(view.sections).toHaveLength(7)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/cases/C1/financials')
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined()
  })

  it('rejects a body without sections as invalid_response', async () => {
    const { sections: _s, ...rest } = makeView()
    reply(rest)
    await expect(getFinancials('C1')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('decide POSTs the action body to the column route', async () => {
    const fetchMock = reply({ column: 'household_size', action: 'accept', proposal_id: 'P1' })
    await decide('C1', 'household_size', { action: 'accept', proposal_id: 'P1' })
    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe('/api/admin/cases/C1/financials/household_size/decide')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ action: 'accept', proposal_id: 'P1' })
  })

  it('guards accept the three evaluation outcomes and reject a malformed line', () => {
    expect(isEvaluationResponse({ run: RUN, outcome: { kind: 'determination' } })).toBe(true)
    expect(isEvaluationResponse({ run: null, outcome: { kind: 'information_needed', missing: [{ column: 'a', label: 'A' }], review_flags: [] } })).toBe(true)
    expect(isEvaluationResponse({ run: null, outcome: { kind: 'standards_unavailable', message: 'Standards unavailable' } })).toBe(true)
    expect(isEvaluationResponse({ run: null, outcome: { kind: 'determination' } })).toBe(false)
    const bad = makeView()
    ;(bad.sections[0].lines[0] as { kind: string }).kind = 'date'
    expect(isFinancialsView(bad)).toBe(false)
  })
})
