import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getState,
  heartbeat,
  isPortalState,
  PortalError,
  start,
  type PortalState,
} from './portal-api'

export const STATE: PortalState = {
  firm_name: 'ValorTax',
  agent_display_name: 'Andrew (case manager)',
  status: 'sent',
  opened_at: null,
  expires_at: '2026-10-25T00:00:00Z',
  steps: [
    {
      id: 's1',
      position: 1,
      kind: 'bank_connect',
      label: 'Connect your bank',
      required: true,
      status: 'pending',
    },
  ],
}

function reply(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_path: string, _init: RequestInit) => ({
    ok: status < 300,
    status,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const initOf = (m: ReturnType<typeof vi.fn>) =>
  m.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }

afterEach(() => vi.unstubAllGlobals())

describe('portal-api', () => {
  it('getState reads /api/c/state with the cookie and no bearer token', async () => {
    const m = reply(200, STATE)
    await expect(getState()).resolves.toEqual(STATE)
    expect(m.mock.calls[0][0]).toBe('/api/c/state')
    const init = initOf(m)
    expect(init.credentials).toBe('same-origin')
    expect(Object.keys(init.headers).map((k) => k.toLowerCase())).not.toContain(
      'authorization'
    )
  })

  it('start posts /api/c/start with X-Requested-With: ResSpark', async () => {
    const m = reply(200, { opened_at: '2026-10-11T09:00:00Z' })
    await expect(start()).resolves.toEqual({
      opened_at: '2026-10-11T09:00:00Z',
    })
    expect(m.mock.calls[0][0]).toBe('/api/c/start')
    expect(initOf(m).method).toBe('POST')
    expect(initOf(m).headers['X-Requested-With']).toBe('ResSpark')
  })

  it('a 401 no_session rejects with PortalError no_session', async () => {
    reply(401, { error: { code: 'no_session', message: 'x' } })
    const err = await getState().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PortalError)
    expect(err).toMatchObject({ status: 401, code: 'no_session' })
  })

  it('a 200 body that is not a PortalState rejects invalid_response', async () => {
    reply(200, { firm_name: 'ValorTax' })
    await expect(getState()).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('isPortalState checks every step key', () => {
    expect(isPortalState(STATE)).toBe(true)
    expect(
      isPortalState({ ...STATE, steps: [{ ...STATE.steps[0], position: '1' }] })
    ).toBe(false)
    expect(isPortalState({ ...STATE, agent_display_name: undefined })).toBe(
      false
    )
  })

  it('heartbeat posts the body with the header and reports ok', async () => {
    const m = reply(200, { ok: true })
    await expect(
      heartbeat({ last_step: 'list', user_agent_class: 'phone' })
    ).resolves.toBe('ok')
    expect(m.mock.calls[0][0]).toBe('/api/c/heartbeat')
    expect(initOf(m).headers['X-Requested-With']).toBe('ResSpark')
    expect(JSON.parse(String(initOf(m).body))).toEqual({
      last_step: 'list',
      user_agent_class: 'phone',
    })
  })

  it('heartbeat never rejects: 429 is rate_limited, a network error is failed', async () => {
    reply(429, { error: { code: 'rate_limited' } })
    await expect(
      heartbeat({ last_step: 'list', user_agent_class: 'desktop' })
    ).resolves.toBe('rate_limited')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline')))
    )
    await expect(
      heartbeat({ last_step: 'list', user_agent_class: 'desktop' })
    ).resolves.toBe('failed')
  })
})
