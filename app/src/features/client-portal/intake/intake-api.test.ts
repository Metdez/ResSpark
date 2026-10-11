import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortalError } from '../portal-api'
import { finishIntake, getIntake, isIntakeState, saveAnswer } from './intake-api'

const STATE = {
  item: { id: 'I1', status: 'pending' },
  questions: [],
  answers: { owns_home: true, household_size: 3 },
  prefill: { is_wage_earner: { value: true, source: 'truv' } },
}

function reply(status: number, body: unknown) {
  const f = vi.fn(async () => ({ ok: status < 300, status, json: async () => body }))
  vi.stubGlobal('fetch', f)
  return f
}

afterEach(() => vi.unstubAllGlobals())

describe('intake api', () => {
  it('getIntake reads the state through the guard', async () => {
    const f = reply(200, STATE)
    await expect(getIntake()).resolves.toEqual(STATE)
    expect(f).toHaveBeenCalledWith('/api/c/intake', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('the guard rejects an unknown prefill source and a non-primitive answer', () => {
    expect(isIntakeState(STATE)).toBe(true)
    expect(isIntakeState({ ...STATE, prefill: { age_taxpayer: { value: 40, source: 'plaid' } } })).toBe(false)
    expect(isIntakeState({ ...STATE, answers: { household_size: [3] } })).toBe(false)
  })

  it('saveAnswer PUTs question_id and value with the ResSpark header', async () => {
    const f = reply(200, { saved: true })
    await saveAnswer('household_size', 3)
    const [path, init] = f.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }]
    expect(path).toBe('/api/c/intake')
    expect(init.method).toBe('PUT')
    expect(init.headers['X-Requested-With']).toBe('ResSpark')
    expect(JSON.parse(String(init.body))).toEqual({ question_id: 'household_size', value: 3 })
  })

  it('finishIntake surfaces 400 incomplete as a PortalError', async () => {
    reply(400, { error: { code: 'incomplete' }, missing: ['owns_home'] })
    await expect(finishIntake()).rejects.toEqual(new PortalError(400, 'incomplete'))
  })
})
