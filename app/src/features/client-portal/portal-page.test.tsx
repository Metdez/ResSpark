import {
  button,
  cleanup,
  click,
  renderWithQuery,
  waitFor,
  type Reply,
} from '@/test-utils/query-render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalState, PortalStep } from './portal-api'
import { PortalPage } from './portal-page'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const step = (
  position: number,
  kind: PortalStep['kind'],
  label: string,
  status: PortalStep['status'] = 'pending'
): PortalStep => ({
  id: `s${position}`,
  position,
  kind,
  label,
  required: true,
  status,
})

// Shuffled on purpose: the page must order by position.
const STEPS: PortalStep[] = [
  step(3, 'address', 'Confirm your address', 'approved'),
  step(1, 'bank_connect', 'Connect your bank'),
  step(5, 'signature', 'Sign your forms', 'rejected'),
  step(2, 'payroll_connect', 'Connect your payroll', 'in_progress'),
  step(4, 'upload', 'Upload your ID', 'submitted'),
]

const state = (over: Partial<PortalState> = {}): PortalState => ({
  firm_name: 'ValorTax',
  agent_display_name: 'Andrew (case manager)',
  status: 'sent',
  opened_at: null,
  expires_at: '2026-10-25T00:00:00Z',
  steps: STEPS,
  ...over,
})

const OPENED = '2026-10-11T09:00:00Z'
const HEARTBEAT: Record<string, Reply> = {
  'POST /api/c/heartbeat': { status: 200, body: { ok: true } },
}
const render = (replies: Record<string, Reply>) =>
  renderWithQuery(<PortalPage />, { ...HEARTBEAT, ...replies })
const okState = (over?: Partial<PortalState>): Record<string, Reply> => ({
  'GET /api/c/state': { status: 200, body: state(over) },
})
const text = () => document.body.textContent ?? ''
const rows = () =>
  [...document.querySelectorAll('[data-step-row]')] as HTMLElement[]
const stateCalls = (m: ReturnType<typeof vi.fn>) =>
  m.mock.calls.filter(([p]) => p === '/api/c/state').length

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('767'),
    media: q,
  }))
})
afterEach(() => {
  cleanup()
  toastError.mockClear()
  document.title = ''
})

describe('PortalPage', () => {
  it('shows the invalid-link copy when there is no session', async () => {
    await render({
      'GET /api/c/state': {
        status: 401,
        body: { error: { code: 'no_session' } },
      },
    })
    await waitFor(() => text().includes("This link isn't active"))
    expect(text()).toContain('Ask your agent for a new link.')
    expect(button('Start')).toBeUndefined()
  })

  it('shows a plain message for other state errors, with no code', async () => {
    await render({
      'GET /api/c/state': {
        status: 500,
        body: { error: { code: 'internal' } },
      },
    })
    await waitFor(() => text().includes('Something went wrong'))
    expect(text()).toContain('Close this page and open your link again.')
    expect(text()).not.toContain('internal')
  })

  it('shows the firm, the agent, the intro and one 44 px Start before opening', async () => {
    await render(okState())
    await waitFor(() => !!button('Start'))
    const h1 = document.querySelector('h1')!
    expect(h1.textContent).toBe('ValorTax')
    expect(h1.getAttribute('title')).toBe('ValorTax')
    expect(text()).toContain('Your agent: Andrew (case manager)')
    expect(text()).toContain(
      'Andrew (case manager) at ValorTax needs a few things from you'
    )
    expect(text()).toContain(
      'It takes a few minutes. You can stop and come back any time from the same link.'
    )
    expect(document.querySelectorAll('button')).toHaveLength(1)
    expect(button('Start')!.className).toContain('h-11')
    expect(rows()).toHaveLength(0)
  })

  it('uses the firm alone when there is no agent name', async () => {
    await render(okState({ agent_display_name: null }))
    await waitFor(() => !!button('Start'))
    expect(text()).toContain('ValorTax needs a few things from you')
    expect(text()).not.toContain('Your agent:')
    expect(text()).not.toContain(' at ValorTax')
  })

  it('sets the tab title to the firm name', async () => {
    await render(okState())
    await waitFor(() => !!button('Start'))
    expect(document.title).toBe('ValorTax')
  })

  it('Start posts with the header and reads Starting… while pending', async () => {
    const { fetchMock } = await render({
      ...okState(),
      'POST /api/c/start': 'pending',
    })
    await waitFor(() => !!button('Start'))
    await click(button('Start')!)
    const call = fetchMock.mock.calls.find(([p]) => p === '/api/c/start')!
    const init = call[1] as RequestInit & { headers: Record<string, string> }
    expect(init.method).toBe('POST')
    expect(init.headers['X-Requested-With']).toBe('ResSpark')
    expect(button('Starting…')).toBeDefined()
    expect(button('Starting…')!.disabled).toBe(true)
  })

  it('after Start the step list renders in position order without another state fetch', async () => {
    const { fetchMock } = await render({
      ...okState(),
      'POST /api/c/start': { status: 200, body: { opened_at: OPENED } },
    })
    await waitFor(() => !!button('Start'))
    await click(button('Start')!)
    await waitFor(() => rows().length === 5)
    expect(text()).toContain('Your steps')
    expect(
      rows().map((r) => r.querySelector('[data-step-label]')!.textContent)
    ).toEqual([
      'Connect your bank',
      'Connect your payroll',
      'Confirm your address',
      'Upload your ID',
      'Sign your forms',
    ])
    expect(stateCalls(fetchMock)).toBe(1)
    expect(text()).not.toContain('needs a few things from you')
  })

  it('a Start 401 swaps to the invalid-link copy', async () => {
    await render({
      ...okState(),
      'POST /api/c/start': {
        status: 401,
        body: { error: { code: 'no_session' } },
      },
    })
    await waitFor(() => !!button('Start'))
    await click(button('Start')!)
    await waitFor(() => text().includes("This link isn't active"))
  })

  it('another Start failure toasts in client words and keeps Start', async () => {
    await render({
      ...okState(),
      'POST /api/c/start': {
        status: 500,
        body: { error: { code: 'internal' } },
      },
    })
    await waitFor(() => !!button('Start'))
    await click(button('Start')!)
    await waitFor(() => toastError.mock.calls.length > 0)
    expect(toastError).toHaveBeenCalledWith("Couldn't start. Try again.")
    expect(button('Start')).toBeDefined()
  })

  it('goes straight to the step list when the link was already opened', async () => {
    await render(okState({ opened_at: OPENED }))
    await waitFor(() => rows().length === 5)
    expect(text()).not.toContain('needs a few things from you')
    expect(button('Start')).toBeUndefined()
  })

  it('shows the empty state when there are no steps', async () => {
    await render(okState({ opened_at: OPENED, steps: [] }))
    await waitFor(() => text().includes('Nothing to do yet'))
    expect(text()).toContain(
      "Your agent hasn't added any steps yet. You can close this page."
    )
  })

  it('renders 44 px rows with description, client chip and a 44 px View, never below 16 px', async () => {
    const { el } = await render(okState({ opened_at: OPENED }))
    await waitFor(() => rows().length === 5)
    for (const r of rows()) {
      expect(r.className).toContain('min-h-11')
      expect(r.querySelector('[data-step-label]')!.className).toContain(
        'text-base'
      )
      const view = r.querySelector('button')!
      expect(view.textContent).toBe('View')
      expect(view.className).toContain('h-11')
    }
    expect(
      rows().map((r) => r.querySelector('[data-slot="badge"]')!.textContent)
    ).toEqual([
      'Not started',
      'In progress',
      'Done',
      'With your agent',
      'Needs attention',
    ])
    expect(rows()[0].textContent).toContain(
      'Connect the bank you use most, so your statements come through automatically.'
    )
    // built from parts so the folder-wide no-small-text grep stays meaningful
    const small = ['sm', 'xs'].map((s) => `.text-${s}`).join(', ')
    expect(el.querySelector(small)).toBeNull()
  })

  it('renders two steps of the same kind as two rows', async () => {
    await render(
      okState({
        opened_at: OPENED,
        steps: [
          step(1, 'upload', 'Upload your ID'),
          step(2, 'upload', 'Upload a pay stub'),
        ],
      })
    )
    await waitFor(() => rows().length === 2)
    expect(rows()[1].textContent).toContain('Upload a pay stub')
    expect(button('View', rows()[0])!.getAttribute('aria-label')).toBe(
      'View Upload your ID'
    )
  })

  it('sends heartbeats: list when opened, the step kind on View', async () => {
    const { fetchMock } = await render(okState({ opened_at: OPENED }))
    await waitFor(() => rows().length === 5)
    const sent = () =>
      fetchMock.mock.calls
        .filter(([p]) => p === '/api/c/heartbeat')
        .map(
          ([, init]) => JSON.parse(String((init as RequestInit).body)).last_step
        )
    expect(sent()).toEqual(['list'])
    await click(button('View', rows()[0])!)
    await waitFor(() => sent().length === 2)
    expect(sent()[1]).toBe('bank_connect')
  })

  it('sends intro as the step before Start', async () => {
    const { fetchMock } = await render(okState())
    await waitFor(() => !!button('Start'))
    const call = fetchMock.mock.calls.find(([p]) => p === '/api/c/heartbeat')!
    expect(JSON.parse(String((call[1] as RequestInit).body)).last_step).toBe(
      'intro'
    )
  })

  it('sends no heartbeat without a session', async () => {
    const { fetchMock } = await render({
      'GET /api/c/state': {
        status: 401,
        body: { error: { code: 'no_session' } },
      },
    })
    await waitFor(() => text().includes("This link isn't active"))
    expect(fetchMock.mock.calls.some(([p]) => p === '/api/c/heartbeat')).toBe(
      false
    )
  })
})
