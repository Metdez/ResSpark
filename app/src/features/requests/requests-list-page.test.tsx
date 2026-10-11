import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  cleanup,
  renderWithQuery,
  waitFor,
  type Reply,
} from '@/test-utils/query-render'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestsListPage, relativeTime } from './requests-list-page'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

const HOUR = 3600 * 1000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const row = (id: string, name: string, status: string) => ({
  id,
  status,
  client_name: name,
  sent_at: ago(2 * HOUR),
  expires_at: ago(-13 * 24 * HOUR),
  created_at: ago(3 * HOUR),
})
const TWO = [row('r2', 'Jordan Rivera', 'sent'), row('r1', 'Sam Lee', 'opened')]

// The page uses TanStack Link, so it renders inside a minimal memory router.
async function render(reply: Reply) {
  const rootRoute = createRootRoute({ component: RequestsListPage })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const out = await renderWithQuery(<RouterProvider router={router} />, {
    'GET /api/admin/requests': reply,
  })
  await waitFor(() => !!out.el.querySelector('h1'))
  return out
}
const loaded = (el: HTMLElement) => () =>
  !!el.querySelector('caption') || el.textContent!.includes('Nothing to do')

describe('RequestsListPage', () => {
  afterEach(cleanup)

  it('lists requests in the returned order with links and status badges', async () => {
    const { el } = await render({ status: 200, body: { requests: TWO } })
    await waitFor(loaded(el))
    expect(el.querySelector('h1')?.textContent).toBe('Requests')
    expect(
      [...el.querySelectorAll('thead th')].map((th) => th.textContent)
    ).toEqual(['Client', 'Status', 'Sent', 'Expires'])
    const rows = [...el.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(2)
    const link = rows[0].querySelector('a')!
    expect(link.textContent).toBe('Jordan Rivera')
    expect(link.getAttribute('href')).toBe('/admin/requests/r2')
    expect(rows[0].textContent).toContain('Sent')
    expect(rows[1].textContent).toContain('Opened')
    expect(el.querySelector('caption')?.textContent).toBe('2 requests')
  })

  it('shows relative times with the ISO timestamp in title', async () => {
    const { el } = await render({ status: 200, body: { requests: TWO } })
    await waitFor(loaded(el))
    const cells = el.querySelectorAll('tbody tr:first-child td')
    expect(cells[2].textContent).toBe('2 hours ago')
    expect(cells[2].querySelector('[title]')?.getAttribute('title')).toBe(
      TWO[0].sent_at
    )
    expect(cells[3].textContent).toBe('in 13 days')
  })

  it('uses the real count for one request', async () => {
    const { el } = await render({ status: 200, body: { requests: [TWO[0]] } })
    await waitFor(loaded(el))
    expect(el.querySelector('caption')?.textContent).toBe('1 request')
  })

  it('renders a dash when a time is missing', async () => {
    const draft = {
      ...TWO[0],
      status: 'draft',
      sent_at: null,
      expires_at: null,
    }
    const { el } = await render({ status: 200, body: { requests: [draft] } })
    await waitFor(loaded(el))
    const cells = el.querySelectorAll('tbody tr td')
    expect(cells[2].textContent).toBe('—')
    expect(cells[3].textContent).toBe('—')
  })

  it('shows the empty block with one Find a client action', async () => {
    const { el } = await render({ status: 200, body: { requests: [] } })
    await waitFor(loaded(el))
    expect(el.querySelector('table')).toBeNull()
    expect(el.textContent).toContain('Nothing to do yet')
    expect(el.textContent).toContain(
      "Requests you send to clients will show up here with their status, who they're waiting on, and how long they've been open."
    )
    const cta = [...el.querySelectorAll('a')]
    expect(cta.map((a) => a.textContent)).toEqual(['Find a client'])
    expect(cta[0].getAttribute('href')).toBe('/admin/lookup')
  })

  it('shows three skeleton rows while loading', async () => {
    const { el } = await render('pending')
    expect(el.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(
      el.querySelectorAll('[data-slot="skeleton"]').length
    ).toBeGreaterThanOrEqual(3)
  })

  it('relativeTime picks the nearest unit', () => {
    const now = Date.parse('2026-10-11T12:00:00Z')
    expect(relativeTime('2026-10-11T11:59:30Z', now)).toBe('30 seconds ago')
    expect(relativeTime('2026-10-11T11:15:00Z', now)).toBe('45 minutes ago')
    expect(relativeTime('2026-10-10T12:00:00Z', now)).toBe('yesterday')
    expect(relativeTime('2026-10-24T12:00:00Z', now)).toBe('in 13 days')
    expect(relativeTime('2026-08-01T12:00:00Z', now)).toBe('2 months ago')
  })
})
