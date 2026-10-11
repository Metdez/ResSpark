import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestPage } from './request-page'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const item = (position: number, label: string) => ({
  id: 'i' + position,
  position,
  kind: 'upload',
  label,
  required: true,
  status: 'pending',
  config: {},
  rejection_note: null,
})

const DRAFT = {
  id: 'r1',
  firm_id: 'f1',
  status: 'draft',
  template_name: 'Standard resolution packet',
  agent_display_name: 'Avery Agent',
  contact_email: null,
  contact_phone_e164: null,
  sent_at: null,
  opened_at: null,
  created_at: '2026-10-11T12:00:00Z',
  case: {
    case_id: 'c1',
    logics_case_id: 900001,
    first_name: 'Jordan',
    last_name: 'Rivera',
    email: 'jordan.rivera@example.com',
    phone_e164: '+15550100001',
  },
  // out of order on purpose: the page sorts by position
  items: [
    item(3, 'Confirm your address'),
    item(1, 'Connect your bank'),
    item(2, 'Connect your payroll'),
    item(5, 'Sign the engagement letter'),
    item(4, 'Government ID'),
  ],
  link: null,
}

const SENT = {
  ...DRAFT,
  status: 'sent',
  link: {
    url: 'https://x/c/existing',
    version: 1,
    expires_at: '2026-10-24T15:00:00Z',
    revoked_at: null,
    opened_at: null,
  },
}

type Reply = { status: number; body: unknown } | 'pending'
let replies: Record<string, Reply>
let fetchMock: ReturnType<typeof vi.fn>
let root: Root | undefined
let container: HTMLDivElement | undefined
const writeText = vi.fn().mockResolvedValue(undefined)

const tick = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

async function render(detail: Reply) {
  replies = { 'GET /api/admin/requests/r1': detail, ...replies }
  fetchMock = vi.fn((path: string, init: RequestInit) => {
    const r = replies[`${init.method ?? 'GET'} ${path}`]
    if (!r) throw new Error('unexpected ' + path)
    if (r === 'pending') return new Promise(() => {})
    return Promise.resolve({
      ok: r.status < 300,
      status: r.status,
      json: async () => r.body,
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  // Radix Checkbox measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <RequestPage requestId='r1' />
      </QueryClientProvider>
    )
  })
  await tick()
  return container
}

const byLabel = (label: string) => {
  const el = [...container!.querySelectorAll('label')].find(
    (l) => l.textContent === label
  )
  return container!.querySelector<HTMLInputElement>('#' + el!.htmlFor)!
}
const button = (text: string) =>
  [...container!.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text
  ) as HTMLButtonElement | undefined

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(el: Element) {
  await act(async () => {
    ;(el as HTMLElement).click()
  })
  await tick()
}
const bodyOf = (path: string) => {
  const call = fetchMock.mock.calls.find(
    ([p, init]) => p === path && init.method === 'POST'
  )
  return call ? JSON.parse(call[1].body ?? 'null') : undefined
}

describe('RequestPage', () => {
  beforeEach(() => {
    replies = {}
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })
  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders a draft: title, badge, items in position order, prefilled contact', async () => {
    const el = await render({ status: 200, body: DRAFT })
    expect(el.querySelector('h1')?.textContent).toBe('Request for Jordan Rivera')
    expect(el.textContent).toContain('Draft')
    const rows = [...el.querySelectorAll('[data-item-row]')]
    expect(
      rows.map((r) => r.querySelector('[data-item-label]')?.textContent)
    ).toEqual([
      'Connect your bank',
      'Connect your payroll',
      'Confirm your address',
      'Government ID',
      'Sign the engagement letter',
    ])
    expect(rows.every((r) => r.textContent?.includes('Not started'))).toBe(true)
    expect(el.textContent).toContain('Send the link')
    expect(byLabel('Client email').value).toBe('jordan.rivera@example.com')
    expect(byLabel('Client phone').value).toBe('(555) 010-0001')
    expect(button('Send link')?.disabled).toBe(false)
  })

  it('offers the did-you-mean fix for a typo domain and blocks Send link', async () => {
    const el = await render({ status: 200, body: DRAFT })
    await type(byLabel('Client email'), 'jordan@gmial.com')
    expect(el.textContent).toContain('Did you mean jordan@gmail.com?')
    expect(button('Use jordan@gmail.com')).toBeDefined()
    expect(button('Send link')?.disabled).toBe(true)
    expect(el.textContent).toContain('Use these values anyway')
  })

  it('applies the suggestion, then flags the value as differing from Logics', async () => {
    const el = await render({ status: 200, body: DRAFT })
    await type(byLabel('Client email'), 'jordan@gmial.com')
    await click(button('Use jordan@gmail.com')!)
    expect(byLabel('Client email').value).toBe('jordan@gmail.com')
    expect(el.textContent).not.toContain('Did you mean')
    expect(el.textContent).toContain('Differs from Logics (j•••@example.com)')
    expect(el.textContent).toContain('Use these values anyway')
    expect(button('Send link')?.disabled).toBe(true)
  })

  it('enables Send link once the flagged values are kept', async () => {
    await render({ status: 200, body: DRAFT })
    await type(byLabel('Client email'), 'jordan@gmail.com')
    await click(container!.querySelector('[role="checkbox"]')!)
    expect(button('Send link')?.disabled).toBe(false)
  })

  it('sends the contact and shows the copyable link with its expiry', async () => {
    replies['POST /api/admin/requests/r1/send'] = {
      status: 200,
      body: {
        url: 'https://x/c/tok',
        expires_at: '2026-10-24T15:00:00Z',
        version: 1,
      },
    }
    const el = await render({ status: 200, body: DRAFT })
    await type(byLabel('Client email'), 'jordan@gmail.com')
    await click(el.querySelector('[role="checkbox"]')!)
    await click(button('Send link')!)
    expect(bodyOf('/api/admin/requests/r1/send')).toEqual({
      email: 'jordan@gmail.com',
      phone: '(555) 010-0001',
      keep_flagged: true,
    })
    expect(el.textContent).toContain('Client link')
    const link = el.querySelector<HTMLInputElement>('input[readonly]')
    expect(link?.value).toBe('https://x/c/tok')
    expect(button('Copy link')).toBeDefined()
    expect(el.textContent).toContain('Expires Oct 24, 2026')
    expect(el.textContent).not.toContain('Send the link')
  })

  it('shows Sending… while the send is in flight', async () => {
    replies['POST /api/admin/requests/r1/send'] = 'pending'
    const el = await render({ status: 200, body: DRAFT })
    await click(button('Send link')!)
    expect(el.textContent).toContain('Sending…')
    expect(button('Sending…')?.disabled).toBe(true)
  })

  it('copies the link, records the copy, and confirms with a toast', async () => {
    replies['POST /api/admin/requests/r1/copied'] = {
      status: 200,
      body: { ok: true, event_id: 'e1' },
    }
    await render({ status: 200, body: SENT })
    await click(button('Copy link')!)
    expect(writeText).toHaveBeenCalledWith('https://x/c/existing')
    expect(bodyOf('/api/admin/requests/r1/copied')).not.toBeUndefined()
    expect(toast.success).toHaveBeenCalledWith('Link copied')
  })

  it('refuses with the case-changed alert and shows no link', async () => {
    replies['POST /api/admin/requests/r1/send'] = {
      status: 409,
      body: {
        error: { code: 'case_changed', message: 'x' },
        changed: ['first_name'],
      },
    }
    const el = await render({ status: 200, body: DRAFT })
    await click(button('Send link')!)
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'This case changed in Logics'
    )
    expect(el.textContent).toContain(
      'Look the client up again before sending.'
    )
    expect(el.textContent).not.toContain('Client link')
  })

  it('renders the server contact_invalid field error under the email', async () => {
    replies['POST /api/admin/requests/r1/send'] = {
      status: 400,
      body: {
        error: { code: 'contact_invalid', message: 'x' },
        email_error: 'Check this email.',
      },
    }
    await render({ status: 200, body: DRAFT })
    await click(button('Send link')!)
    const email = byLabel('Client email')
    expect(email.getAttribute('aria-invalid')).toBe('true')
    const hint = document.getElementById(email.getAttribute('aria-describedby')!)
    expect(hint?.textContent).toBe('Check this email.')
  })

  it('shows the Logics not-configured alert from the send route', async () => {
    replies['POST /api/admin/requests/r1/send'] = {
      status: 409,
      body: { error: { code: 'logics_not_configured', message: 'x' } },
    }
    const el = await render({ status: 200, body: DRAFT })
    await click(button('Send link')!)
    expect(el.textContent).toContain('Logics is not configured')
  })

  it('renders an already-sent request with the link card and no contact form', async () => {
    const el = await render({ status: 200, body: SENT })
    expect(el.textContent).toContain('Sent')
    expect(el.querySelector<HTMLInputElement>('input[readonly]')?.value).toBe(
      'https://x/c/existing'
    )
    expect(el.textContent).not.toContain('Send the link')
    expect(button('Send link')).toBeUndefined()
  })

  it('shows three skeleton rows and no form while loading', async () => {
    const el = await render('pending')
    expect(el.querySelectorAll('[data-slot="skeleton"]').length).toBe(3)
    expect(el.querySelector('input')).toBeNull()
  })
})
