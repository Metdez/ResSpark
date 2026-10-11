import { act } from 'react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import {
  button,
  cleanup,
  click,
  keyDown,
  renderWithQuery,
  type,
  waitFor,
} from '@/test-utils/query-render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ago } from '@/lib/relative-time'
import { requestStatusBadge } from '@/lib/status'
import type { DashboardRow } from './api'
import { Filters } from './filters'
import { RequestTable } from './request-table'
import { useRequests } from './use-requests'

vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-router')>()),
  useNavigate: vi.fn(),
  useSearch: vi.fn(),
}))
vi.mock('./use-requests', () => ({ useRequests: vi.fn() }))

const HOUR = 3600 * 1000
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
const row = (over: Partial<DashboardRow>): DashboardRow => ({
  id: 'r1',
  case_id: 'c1',
  status: 'sent',
  template_name: 'Documents only',
  agent_display_name: 'Zack',
  client_name: 'Jordan Rivera',
  first_name: 'Jordan',
  last_name: 'Rivera',
  email: 'j@x.com',
  created_at: iso(5 * HOUR),
  sent_at: iso(4 * HOUR),
  opened_at: null,
  completed_at: null,
  expires_at: null,
  last_activity_at: iso(1 * HOUR),
  overdue: false,
  ...over,
})
const NEWER = row({ id: 'r2', status: 'in_progress', client_name: 'Sam Lee' })
const OLDER = row({
  id: 'r1',
  status: 'sent',
  overdue: true,
  sent_at: iso(80 * HOUR),
  last_activity_at: iso(70 * HOUR),
})

type QueryState = {
  data?: { requests: DashboardRow[] }
  isError?: boolean
}
const navigate = vi.fn()
let search: { status?: string; q?: string } = {}

function setQuery(state: QueryState) {
  vi.mocked(useRequests).mockReturnValue({
    isError: false,
    refetch: vi.fn(),
    ...state,
  } as never)
}

async function render() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Filters />
        <RequestTable />
      </>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const out = await renderWithQuery(<RouterProvider router={router} />, {})
  await waitFor(() => !!out.el.querySelector('input'))
  return out.el
}
const bodyRows = (el: HTMLElement) => [...el.querySelectorAll('tbody tr')]

describe('dashboard RequestTable and Filters', () => {
  beforeEach(() => {
    search = {}
    vi.mocked(useSearch).mockImplementation((() => search) as never)
    vi.mocked(useNavigate).mockReturnValue(navigate as never)
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('shows the table header and exactly 3 skeleton rows while pending', async () => {
    setQuery({})
    const el = await render()
    expect(el.querySelectorAll('thead th').length).toBe(8)
    expect(bodyRows(el)).toHaveLength(3)
    expect(el.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('shows the empty block with a lookup CTA when there are no requests', async () => {
    setQuery({ data: { requests: [] } })
    const el = await render()
    expect(el.textContent).toContain('No requests yet')
    expect(el.textContent).toContain('Send a client a link to see it here.')
    const cta = [...el.querySelectorAll('a')].find(
      (a) => a.textContent === 'Look up a client'
    )
    expect(cta?.getAttribute('href')).toBe('/admin/lookup')
  })

  it('names the search when nothing matches, with no CTA', async () => {
    search = { q: 'zed' }
    setQuery({ data: { requests: [] } })
    const el = await render()
    expect(el.textContent).toContain('No requests match "zed"')
    expect(el.textContent).not.toContain('Look up a client')
  })

  it('renders rows with links, badges, Overdue only where flagged, ages with ISO titles and a count', async () => {
    setQuery({ data: { requests: [NEWER, OLDER] } })
    const el = await render()
    expect(
      [...el.querySelectorAll('thead th')].map((th) => th.textContent)
    ).toEqual([
      'Client',
      'Template',
      'Status',
      'Sent',
      'Opened',
      'Last activity',
      'Agent',
      '',
    ])
    const [a, b] = bodyRows(el)
    expect(a.querySelector('a')?.textContent).toBe('Sam Lee')
    expect(a.querySelector('a')?.getAttribute('href')).toBe('/admin/requests/r2')
    expect(a.textContent).toContain(requestStatusBadge('in_progress').label)
    expect(b.textContent).toContain(requestStatusBadge('sent').label)
    expect(a.textContent).not.toContain('Overdue')
    expect(b.textContent).toContain('Overdue')
    const sent = b.querySelector(`[title="${OLDER.sent_at}"]`)
    expect(sent?.textContent).toBe(ago(OLDER.sent_at))
    expect(el.textContent).toContain('2 requests')
  })

  it('says 1 request for a single row', async () => {
    setQuery({ data: { requests: [NEWER] } })
    const el = await render()
    expect(el.textContent).toContain('1 request')
    expect(el.textContent).not.toContain('1 requests')
  })

  it('renders the status chips in order and writes the chosen one to the URL', async () => {
    search = { status: 'sent' }
    setQuery({ data: { requests: [NEWER] } })
    const el = await render()
    const chips = [...el.querySelectorAll('button[aria-pressed]')]
    expect(chips.map((c) => c.textContent)).toEqual([
      'All',
      'Sent',
      'Opened',
      'In progress',
      'Waiting on staff',
      'Complete',
      'Revoked',
    ])
    expect(button('Sent', el)?.getAttribute('aria-pressed')).toBe('true')
    expect(button('All', el)?.getAttribute('aria-pressed')).toBe('false')

    await click(button('Complete', el)!)
    const call = navigate.mock.calls.at(-1)![0]
    expect(call.search({ q: 'ann' })).toEqual({ q: 'ann', status: 'complete' })
    await click(button('All', el)!)
    expect(navigate.mock.calls.at(-1)![0].search({ status: 'sent' })).toEqual({
      status: undefined,
    })
  })

  it('debounces the search box by 300 ms before writing q', async () => {
    setQuery({ data: { requests: [NEWER] } })
    const el = await render()
    vi.useFakeTimers()
    const input = el.querySelector<HTMLInputElement>(
      'input[placeholder="Search name or email"]'
    )!
    await type(input, 'ann')
    await act(async () => {
      vi.advanceTimersByTime(299)
    })
    expect(navigate).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate.mock.calls[0][0].search({ status: 'sent' })).toEqual({
      status: 'sent',
      q: 'ann',
    })
  })

  it('re-sorts by Last activity from the column header', async () => {
    setQuery({ data: { requests: [NEWER, OLDER] } })
    const el = await render()
    expect(bodyRows(el)[0].querySelector('a')?.textContent).toBe('Sam Lee')
    const header = [...el.querySelectorAll('thead button')].find(
      (b) => b.textContent === 'Last activity'
    )!
    await keyDown(header, 'Enter')
    const asc = [...document.querySelectorAll('[role="menuitem"]')].find(
      (m) => m.textContent?.trim() === 'Asc'
    )!
    await click(asc)
    expect(bodyRows(el)[0].querySelector('a')?.textContent).toBe(
      'Jordan Rivera'
    )
  })

  it('keeps the rows and says it is retrying when a poll fails', async () => {
    setQuery({ data: { requests: [NEWER] }, isError: true })
    const el = await render()
    expect(bodyRows(el)).toHaveLength(1)
    expect(el.textContent).toContain("Couldn't refresh — retrying")
  })

  it('shows a destructive alert with Retry when the first load fails', async () => {
    const refetch = vi.fn()
    vi.mocked(useRequests).mockReturnValue({ isError: true, refetch } as never)
    const el = await render()
    expect(el.textContent).toContain("Couldn't load requests.")
    await click(button('Retry', el)!)
    expect(refetch).toHaveBeenCalled()
  })
})
