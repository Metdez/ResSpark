import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollInterval } from '@/lib/polling'
import { ago } from '@/lib/relative-time'
import { fetchEvents, type EventRow, type EventsResponse } from './api'
import { Timeline } from './timeline'

vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), fetchEvents: vi.fn() }))
vi.mock('@tanstack/react-query', async (orig) => {
  const real = await orig<typeof import('@tanstack/react-query')>()
  return { ...real, useQuery: vi.fn(real.useQuery) }
})

const event = (id: number, over: Partial<EventRow> = {}): EventRow => ({
  id,
  actor_type: 'staff',
  action: 'request.sent',
  payload: {},
  created_at: new Date(Date.parse('2026-10-11T12:00:00Z') - id * 60_000).toISOString(),
  ...over,
})
const page = (events: EventRow[], next_before: string | null = null): EventsResponse => ({ events, next_before })

let root: Root | undefined
let container: HTMLDivElement

const tick = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

async function render() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <Timeline caseId='c1' />
      </QueryClientProvider>
    )
  )
  await tick()
}

const rows = () => [...container.querySelectorAll('[data-event-row]')]
const labels = () => rows().map((r) => r.querySelector('[data-event-label]')!.textContent)
const loadOlder = () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Load older')

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  vi.mocked(fetchEvents).mockReset()
  vi.mocked(useQuery).mockClear()
})

describe('Timeline', () => {
  it('shows three skeleton rows while pending', async () => {
    vi.mocked(fetchEvents).mockReturnValue(new Promise(() => {}))
    await render()
    expect(container.querySelectorAll('[data-timeline-skeleton]')).toHaveLength(3)
  })

  it('says No activity yet for zero events', async () => {
    vi.mocked(fetchEvents).mockResolvedValue(page([]))
    await render()
    expect(container.textContent).toContain('No activity yet')
    expect(loadOlder()).toBeUndefined()
  })

  it('lists events newest first with actor badge, label, and relative time', async () => {
    vi.mocked(fetchEvents).mockResolvedValue(
      page([
        event(1, { actor_type: 'client', action: 'request.opened' }),
        event(2, { actor_type: 'system', action: 'request.created' }),
        event(3, { actor_type: 'provider', action: 'provider.plaid.item_added' }),
        event(4, { actor_type: 'staff', action: 'case.looked_up' }),
      ])
    )
    await render()
    expect(labels()).toEqual([
      'Client opened the link',
      'Created the request',
      'provider plaid item added',
      'Looked up the case',
    ])
    expect(rows().map((r) => r.querySelector('[data-slot="badge"]')!.textContent)).toEqual([
      'Client',
      'System',
      'Provider',
      'Staff',
    ])
    const time = rows()[0].querySelector('[title]')!
    expect(time.getAttribute('title')).toBe(event(1).created_at)
    expect(time.textContent).toBe(ago(event(1).created_at))
    expect(loadOlder()).toBeUndefined()
  })

  it('pages 50 at a time with Load older, appending below and deduping by id', async () => {
    const first = Array.from({ length: 50 }, (_, i) => event(i + 1))
    const cursor = first[49].created_at
    vi.mocked(fetchEvents)
      .mockResolvedValueOnce(page(first, cursor))
      .mockResolvedValueOnce(page([event(50), event(51, { action: 'case.looked_up' })], null))
    await render()
    expect(rows()).toHaveLength(50)
    const firstRow = rows()[0]

    await act(async () => loadOlder()!.click())
    await tick()

    expect(fetchEvents).toHaveBeenLastCalledWith('c1', cursor)
    expect(rows()).toHaveLength(51)
    expect(rows()[0]).toBe(firstRow)
    expect(labels()[50]).toBe('Looked up the case')
    expect(loadOlder()).toBeUndefined()
  })

  it('polls only the first page', async () => {
    vi.mocked(fetchEvents).mockResolvedValue(page([event(1)]))
    await render()
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['events', 'c1'], refetchInterval: pollInterval })
    )
    expect(vi.mocked(fetchEvents).mock.calls.every((c) => c.length === 1)).toBe(true)
  })
})
