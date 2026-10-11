import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHeartbeat } from './use-heartbeat'

type Opts = Parameters<typeof useHeartbeat>[0]

function Probe(props: Opts) {
  useHeartbeat(props)
  return null
}

let root: Root | undefined
let visibility: DocumentVisibilityState = 'visible'
let statuses: number[] = []
const fetchMock = vi.fn(async (_path: string, _init: RequestInit) => {
  const status = statuses.shift() ?? 200
  return { ok: status < 300, status, json: async () => ({ ok: true }) }
})

const posts = () =>
  fetchMock.mock.calls
    .filter(([p]) => p === '/api/c/heartbeat')
    .map(([, init]) => JSON.parse(String(init.body)))

async function mount(props: Opts) {
  root = createRoot(document.createElement('div'))
  await act(async () => root!.render(createElement(Probe, props)))
}
const rerender = (props: Opts) =>
  act(async () => root!.render(createElement(Probe, props)))
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  statuses = []
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('767') }))
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
})
afterEach(() => {
  act(() => root?.unmount())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useHeartbeat', () => {
  it('posts once at mount with the step and the device class', async () => {
    await mount({ enabled: true, lastStep: 'list' })
    expect(posts()).toEqual([{ last_step: 'list', user_agent_class: 'phone' }])
    const init = fetchMock.mock.calls[0][1] as RequestInit & {
      headers: Record<string, string>
    }
    expect(init.headers['X-Requested-With']).toBe('ResSpark')
  })

  it('posts again at 30 000 ms, not at 29 999 ms', async () => {
    await mount({ enabled: true, lastStep: 'list' })
    await advance(29_999)
    expect(posts()).toHaveLength(1)
    await advance(1)
    expect(posts()).toHaveLength(2)
  })

  it('sends nothing on a tick while the page is hidden', async () => {
    await mount({ enabled: true, lastStep: 'list' })
    visibility = 'hidden'
    await advance(30_000)
    expect(posts()).toHaveLength(1)
  })

  it('posts at once when the step changes', async () => {
    await mount({ enabled: true, lastStep: 'list' })
    await rerender({ enabled: true, lastStep: 'bank_connect' })
    expect(posts()[1]).toEqual({
      last_step: 'bank_connect',
      user_agent_class: 'phone',
    })
  })

  it('sends a fixed error code when given one', async () => {
    await mount({ enabled: true, lastStep: 'list', lastError: 'state_failed' })
    expect(posts()[0].last_error).toBe('state_failed')
  })

  it('posts nothing when disabled', async () => {
    await mount({ enabled: false, lastStep: 'list' })
    await advance(60_000)
    expect(posts()).toHaveLength(0)
  })

  it('skips the next tick after a 429', async () => {
    statuses = [200, 429]
    await mount({ enabled: true, lastStep: 'list' })
    await advance(30_000)
    expect(posts()).toHaveLength(2)
    await advance(30_000)
    expect(posts()).toHaveLength(2)
    await advance(30_000)
    expect(posts()).toHaveLength(3)
  })

  it('stops on unmount', async () => {
    await mount({ enabled: true, lastStep: 'list' })
    act(() => root!.unmount())
    root = undefined
    await advance(90_000)
    expect(posts()).toHaveLength(1)
  })
})
