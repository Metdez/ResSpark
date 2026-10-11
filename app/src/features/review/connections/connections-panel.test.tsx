import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider, keepPreviousData, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { pollInterval } from '@/lib/polling'
import * as api from './api'
import type { ConnectionSummary } from './api'
import { ConnectionsPanel } from './connections-panel'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  fetchConnections: vi.fn(),
  refreshConnection: vi.fn(),
  fetchTransactions: vi.fn(),
}))
vi.mock('@tanstack/react-query', async (orig) => {
  const real = await orig<typeof import('@tanstack/react-query')>()
  return { ...real, useQuery: vi.fn(real.useQuery) }
})

const conn = (over: Partial<ConnectionSummary>): ConnectionSummary => ({
  id: 'C1',
  request_item_id: 'I1',
  kind: 'bank',
  provider: 'plaid',
  status: 'syncing',
  error: null,
  created_at: '2026-10-10T08:00:00Z',
  last_webhook_at: '2026-10-10T08:30:00Z',
  last_polled_at: '2026-10-10T09:00:00Z',
  accounts: [],
  transactions: { count: 0, update_status: 'not_ready' },
  employers: [],
  ...over,
})
const TWO = [
  conn({}),
  conn({ id: 'C2', kind: 'payroll', provider: 'truv', status: 'done', last_polled_at: '2026-10-09T09:00:00Z' }),
]

let root: Root | undefined
let container: HTMLDivElement
let client: QueryClient

const tick = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

async function render() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <ConnectionsPanel requestId='R1' />
      </QueryClientProvider>
    )
  })
  await tick()
}

const cards = () => [...container.querySelectorAll<HTMLElement>('[data-connection]')]
const refreshButton = (card: HTMLElement) =>
  [...card.querySelectorAll('button')].find((b) => /Refresh/.test(b.textContent ?? '')) as HTMLButtonElement
const click = (el: HTMLElement) =>
  act(async () => {
    el.click()
  })

beforeEach(() => {
  vi.mocked(api.fetchConnections).mockResolvedValue({ connections: TWO })
  vi.mocked(api.refreshConnection).mockResolvedValue({ connection: TWO[0] })
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ConnectionsPanel', () => {
  it('polls with pollInterval and keeps previous data', async () => {
    await render()
    const calls = vi.mocked(useQuery).mock.calls
    const options = calls[calls.length - 1][0]
    expect(options.queryKey).toEqual(['connections', 'R1'])
    expect(options.refetchInterval).toBe(pollInterval)
    expect(options.placeholderData).toBe(keepPreviousData)
  })

  it('shows three skeleton rows while loading', async () => {
    vi.mocked(api.fetchConnections).mockReturnValue(new Promise(() => {}))
    await render()
    expect(container.querySelectorAll('[data-skeleton]')).toHaveLength(3)
  })

  it('shows the empty block for no connections', async () => {
    vi.mocked(api.fetchConnections).mockResolvedValue({ connections: [] })
    await render()
    const empty = [...container.querySelectorAll('div')].find((d) => d.textContent === 'No connections yet')!
    expect(empty.className).toContain('min-h-60')
  })

  it('renders one card per connection in server order with kind and provider', async () => {
    await render()
    expect(cards().map((c) => c.getAttribute('data-connection'))).toEqual(['C1', 'C2'])
    expect(cards()[0].querySelector('h3')!.textContent).toBe('Bank')
    expect(cards()[1].querySelector('h3')!.textContent).toBe('Payroll')
    expect(cards()[0].textContent).toContain('Plaid')
    expect(cards()[1].textContent).toContain('Truv')
  })

  it('mirrors server status as badges, never a 0-transactions final reading while syncing', async () => {
    await render()
    expect(cards()[0].textContent).toContain('Syncing (bank is sending history)')
    expect(cards()[0].textContent).toContain('Transactions: 0 · Syncing')
    expect(cards()[1].textContent).toContain('Done')
  })

  it('shows Last synced and Last webhook with the ISO in title', async () => {
    await render()
    const synced = [...cards()[0].querySelectorAll('span')].find((s) => s.textContent?.startsWith('Last synced'))!
    expect(synced.getAttribute('title')).toBe('2026-10-10T09:00:00Z')
    const hook = [...cards()[0].querySelectorAll('span')].find((s) => s.textContent?.startsWith('Last webhook'))!
    expect(hook.getAttribute('title')).toBe('2026-10-10T08:30:00Z')
    expect(refreshButton(cards()[1])).toBeTruthy()
  })

  it('shows the error code label for a connection that needs the client', async () => {
    vi.mocked(api.fetchConnections).mockResolvedValue({
      connections: [conn({ status: 'error', error: { code: 'ITEM_LOGIN_REQUIRED' } })],
    })
    await render()
    expect(cards()[0].textContent).toContain('Client must reconnect')
    expect(cards()[0].textContent).toContain('ITEM_LOGIN_REQUIRED')
  })

  it('Refresh calls the route, shows Refreshing… while pending, then invalidates the list', async () => {
    let resolve!: (v: { connection: ConnectionSummary }) => void
    vi.mocked(api.refreshConnection).mockReturnValue(new Promise((r) => (resolve = r)))
    await render()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await click(refreshButton(cards()[0]))
    await tick()
    expect(api.refreshConnection).toHaveBeenCalledWith('C1')
    expect(refreshButton(cards()[0]).textContent).toBe('Refreshing…')
    expect(refreshButton(cards()[0]).disabled).toBe(true)
    await act(async () => resolve({ connection: TWO[0] }))
    await tick()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['connections', 'R1'] })
    expect(refreshButton(cards()[0]).textContent).toBe('Refresh')
  })

  it('a 502 shows the generic toast with the code in muted text', async () => {
    vi.mocked(api.refreshConnection).mockRejectedValue(new ApiError(502, 'provider_unavailable', 'x'))
    await render()
    await click(refreshButton(cards()[0]))
    await tick()
    expect(toast.error).toHaveBeenCalledTimes(1)
    const [message, opts] = vi.mocked(toast.error).mock.calls[0] as [string, { description: React.ReactElement<{ className: string; children: string }> }]
    expect(message).toBe(GENERIC_ERROR)
    expect(opts.description.props.children).toBe('provider_unavailable')
    expect(opts.description.props.className).toContain('text-muted-foreground')
  })
})
