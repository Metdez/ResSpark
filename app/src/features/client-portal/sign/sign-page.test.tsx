import { act } from 'react'
import {
  button,
  cleanup,
  click,
  postedBody,
  renderWithQuery,
  waitFor,
  type Reply,
} from '@/test-utils/query-render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignPage } from './sign-page'

// The real @docuseal/react renders here: jsdom never fetches its form.js, and the data-* attributes
// it writes are the contract with that script.
const m = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => m.navigate,
  Link: ({ to, children, ...p }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...p}>
      {children}
    </a>
  ),
}))

const START = 'POST /api/c/items/I1/signature/start'
const EMBED = 'https://docuseal.com/s/fakeSlug'
const STATE: Reply = {
  status: 200,
  body: {
    firm_name: 'ValorTax',
    agent_display_name: null,
    status: 'in_progress',
    opened_at: '2026-10-11T09:00:00Z',
    expires_at: '2026-10-25T00:00:00Z',
    steps: [],
  },
}
const fail = (status: number, code: string): Reply => ({ status, body: { error: { code, message: code } } })
const ok = (body: unknown): Reply => ({ status: 200, body })

// Fills defaults into the caller's table in place: the harness reads it on every call, so a test
// can change the next start's answer.
const render = (replies: Record<string, Reply>) =>
  renderWithQuery(
    <SignPage itemId='I1' />,
    Object.assign(replies, {
      'GET /api/c/state': STATE,
      'POST /api/c/heartbeat': ok({ ok: true }),
      'POST /api/c/consents': ok({ ok: true }),
      'POST /api/c/connections/C1/reconcile': { status: 202, body: { ok: true } },
      ...replies,
    })
  )
const text = () => document.body.textContent ?? ''
const form = () => document.querySelector('docuseal-form')
const dialog = () => document.querySelector('[role="dialog"]')
const starts = (f: ReturnType<typeof vi.fn>) =>
  f.mock.calls.filter(([p]) => p === '/api/c/items/I1/signature/start').length

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('767'), media: q }))
})
afterEach(cleanup)

describe('SignPage', () => {
  it('a first start 409 consent_required opens Before you sign with the five points', async () => {
    await render({ [START]: fail(409, 'consent_required') })
    await waitFor(() => !!dialog())
    expect(dialog()!.textContent).toContain('Before you sign')
    expect(dialog()!.querySelectorAll('li')).toHaveLength(5)
    expect(dialog()!.textContent).toContain('ValorTax keeps a record')
    expect(form()).toBeNull()
  })

  it('I agree records the esign consent, starts again, and renders the embed', async () => {
    const replies: Record<string, Reply> = { [START]: fail(409, 'consent_required') }
    const { fetchMock } = await render(replies)
    await waitFor(() => !!dialog())
    replies[START] = ok({ connection_id: 'C1', embed_src: EMBED })
    await click(button('I agree', dialog()!)!)
    await waitFor(() => !!form())
    expect(postedBody(fetchMock, '/api/c/consents')).toEqual({ kind: 'esign', text_version: 'esign-v1' })
    expect(starts(fetchMock)).toBe(2)
    expect(form()!.getAttribute('data-src')).toBe(EMBED)
  })

  it('renders the embed with the D-13 attributes', async () => {
    await render({ [START]: ok({ connection_id: 'C1', embed_src: EMBED }) })
    await waitFor(() => !!form())
    const a = (n: string) => form()!.getAttribute(`data-${n}`)
    expect(a('src')).toBe(EMBED)
    expect(a('with-title')).toBe('false')
    expect(a('with-send-copy-button')).toBe('false')
    expect(a('send-copy-email')).toBe('false')
    expect(a('allow-to-resubmit')).toBe('false')
    expect(a('only-required-fields')).toBe('true')
    expect(a('language')).toBe('en')
    expect(a('expand')).toBe('true')
    expect(a('go-to-last')).toBe('true')
    expect(a('allow-typed-signature')).toBe('true')
    expect(a('custom-css')).toContain('font-size:16px')
  })

  it('Not now goes back to the steps', async () => {
    await render({ [START]: fail(409, 'consent_required') })
    await waitFor(() => !!dialog())
    await click(button('Not now', dialog()!)!)
    expect(m.navigate).toHaveBeenCalledWith({ to: '/c' })
  })

  it('a stale consent keeps the sheet open with the read-again notice', async () => {
    await render({ [START]: fail(409, 'consent_text_stale') })
    await waitFor(() => !!dialog())
    expect(dialog()!.textContent).toContain('Please read and agree again.')
  })

  it.each(['provider_not_configured', 'template_not_mapped', 'template_invalid'])(
    '503 %s says the agent will send it another way, with a way back and no embed',
    async (code) => {
      await render({ [START]: fail(503, code) })
      await waitFor(() => text().includes('Your agent will send this form another way.'))
      const backs = [...document.querySelectorAll('main a')].filter((l) => l.textContent === 'Back to your steps')
      expect(backs).toHaveLength(1)
      expect(form()).toBeNull()
      expect(dialog()).toBeNull()
    }
  )

  it('signed: true says it is already signed', async () => {
    await render({ [START]: ok({ connection_id: 'C1', signed: true }) })
    await waitFor(() => text().includes('You already signed this. Your agent has it.'))
    expect(form()).toBeNull()
  })

  it('an approved item says it is already signed', async () => {
    await render({ [START]: fail(409, 'item_approved') })
    await waitFor(() => text().includes('You already signed this. Your agent has it.'))
  })

  it('a 401 shows the invalid-link page', async () => {
    await render({ [START]: fail(401, 'no_session') })
    await waitFor(() => text().includes("This link isn't active"))
  })

  it('another error offers Try again, which starts again', async () => {
    const replies: Record<string, Reply> = { [START]: fail(502, 'provider_error') }
    const { fetchMock } = await render(replies)
    await waitFor(() => text().includes('Something went wrong. Try again.'))
    replies[START] = ok({ connection_id: 'C1', embed_src: EMBED })
    await click(button('Try again')!)
    await waitFor(() => !!form())
    expect(starts(fetchMock)).toBe(2)
  })

  it('completing reconciles, then returns to the steps with signed=<item>', async () => {
    const { fetchMock } = await render({ [START]: ok({ connection_id: 'C1', embed_src: EMBED }) })
    await waitFor(() => !!form())
    await act(async () => {
      form()!.dispatchEvent(new CustomEvent('completed', { detail: {} }))
    })
    await waitFor(() => m.navigate.mock.calls.length > 0)
    const reconciled = fetchMock.mock.calls.some(
      ([p, i]) => p === '/api/c/connections/C1/reconcile' && (i as RequestInit).method === 'POST'
    )
    expect(reconciled).toBe(true)
    expect(m.navigate).toHaveBeenCalledWith({ to: '/c', search: { signed: 'I1' } })
  })

  it('has a 44 px Back to your steps header and is full-bleed', async () => {
    const { el } = await render({ [START]: 'pending' })
    const back = el.querySelector('header a')!
    expect(back.textContent).toBe('Back to your steps')
    expect(back.className).toContain('min-h-11')
    expect(back.getAttribute('href')).toBe('/c')
    expect(el.firstElementChild!.className).toContain('min-h-dvh')
    expect(text()).toContain('Getting your form ready…')
  })

  it('reports last_step signature on the heartbeat', async () => {
    const { fetchMock } = await render({ [START]: 'pending' })
    await waitFor(() => fetchMock.mock.calls.some(([p]) => p === '/api/c/heartbeat'))
    expect(postedBody(fetchMock, '/api/c/heartbeat')).toMatchObject({ last_step: 'signature' })
  })
})
