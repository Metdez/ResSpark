import { act } from 'react'
import { cleanup, renderWithQuery } from '@/test-utils/query-render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalState, PortalStep } from '../portal-api'
import { ReturnPage } from './return-page'

const m = vi.hoisted(() => ({ getState: vi.fn(), navigate: vi.fn(), success: vi.fn() }))
vi.mock('../portal-api', async (orig) => ({ ...(await orig<object>()), getState: m.getState }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => m.navigate }))
vi.mock('sonner', () => ({ toast: { success: m.success, error: vi.fn() } }))

const bank = (status: PortalStep['status']): PortalStep => ({
  id: 'B1',
  position: 1,
  kind: 'bank_connect',
  label: 'Connect your bank',
  required: true,
  status,
})
const state = (status: PortalStep['status']): PortalState => ({
  firm_name: 'ValorTax',
  agent_display_name: null,
  status: 'in_progress',
  opened_at: '2026-10-11T09:00:00Z',
  expires_at: '2026-10-25T00:00:00Z',
  steps: [bank(status)],
})
const text = () => document.body.textContent ?? ''
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  m.getState.mockResolvedValue(state('in_progress'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ReturnPage', () => {
  it('waits and polls the state every 3 s without starting anything', async () => {
    const { fetchMock } = await renderWithQuery(<ReturnPage />, {})
    expect(text()).toContain('Checking your connection…')
    const first = m.getState.mock.calls.length
    expect(first).toBeGreaterThanOrEqual(1)
    await advance(3_000)
    await advance(3_000)
    expect(m.getState.mock.calls.length).toBeGreaterThanOrEqual(first + 2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('goes back to the steps with a toast once the bank step is with the agent', async () => {
    await renderWithQuery(<ReturnPage />, {})
    m.getState.mockResolvedValue(state('submitted'))
    await advance(3_000)
    expect(m.navigate).toHaveBeenCalledWith({ to: '/c', replace: true })
    expect(m.success).toHaveBeenCalledWith('Bank connected')
  })

  it('after 45 s shows the slow copy and a 44 px way back, and keeps polling', async () => {
    await renderWithQuery(<ReturnPage />, {})
    expect(text()).not.toContain('This is taking longer than usual.')
    await advance(45_000)
    expect(text()).toContain('This is taking longer than usual.')
    const back = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Back to your steps')!
    expect(back.className).toContain('h-11')
    const calls = m.getState.mock.calls.length
    await advance(3_000)
    expect(m.getState.mock.calls.length).toBeGreaterThan(calls)
    await act(async () => back.click())
    expect(m.navigate).toHaveBeenCalledWith({ to: '/c' })
  })

  it('a 401 shows the invalid-link page and stops polling', async () => {
    const { PortalError } = await import('../portal-api')
    m.getState.mockRejectedValue(new PortalError(401, 'no_session'))
    await renderWithQuery(<ReturnPage />, {})
    await advance(10)
    expect(text()).toContain("This link isn't active")
    const calls = m.getState.mock.calls.length
    await advance(9_000)
    expect(m.getState.mock.calls.length).toBe(calls)
  })
})
