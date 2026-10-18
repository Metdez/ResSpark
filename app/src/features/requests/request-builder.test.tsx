import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  cleanup,
  click,
  keyDown,
  postedBody,
  renderWithQuery,
  type,
  type Reply,
  waitFor,
} from '@/test-utils/query-render'
import { RequestBuilder } from './request-builder'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

const STANDARD = '00000000-0000-0000-0000-00000000a001'
const BANK_PAYROLL = '00000000-0000-0000-0000-00000000a003'
const item = (kind: string, label: string, config = {}) => ({
  kind,
  label,
  required: true,
  config,
})
// Ordered by name, as the Worker returns them.
const TEMPLATES = {
  templates: [
    {
      id: BANK_PAYROLL,
      name: 'Bank and payroll',
      items: [
        item('bank_connect', 'Connect your bank'),
        item('payroll_connect', 'Connect your payroll'),
      ],
    },
    {
      id: '00000000-0000-0000-0000-00000000a002',
      name: 'Documents only',
      items: [
        item('upload', 'Government ID'),
        item('upload', 'Last 3 bank statements'),
        item('upload', 'Last 2 pay stubs'),
      ],
    },
    {
      id: STANDARD,
      name: 'Standard resolution packet',
      items: [
        item('bank_connect', 'Connect your bank'),
        item('payroll_connect', 'Connect your payroll'),
        item('address', 'Confirm your address'),
        item('upload', 'Government ID', { doc_code: 'government_id' }),
        item('signature', 'Engagement letter', { template: 'engagement_letter' }),
      ],
    },
  ],
}
const CASE = {
  case_id: 'c1',
  logics_case_id: 900001,
  first_name: 'Jordan',
  last_name: 'Rivera',
  email: 'jordan.rivera@example.com',
  phone_e164: '+15550100001',
  logics_fetched_at: '2026-10-11T12:00:00Z',
}
const HOUR = 3600 * 1000
const since = (ms: number) => new Date(Date.now() - ms).toISOString()
const EXISTING = [
  { id: 'r7', status: 'sent', agent_display_name: 'Avery Agent', sent_at: since(2 * HOUR), created_at: since(3 * HOUR) },
  { id: 'r8', status: 'draft', agent_display_name: null, sent_at: null, created_at: since(HOUR / 2) },
]

const ESIGN = '/api/admin/esign/settings'
const esign = (
  configured: boolean,
  mapping: Record<string, number | null> = { engagement_letter: 1001, form_2848: 2002, form_8821: null }
): Reply => ({ status: 200, body: { configured, env: 'test', mapping } })

const onCreated = vi.fn()
// The first render pays the lazy supabase import and the module graph; under a full parallel run
// that alone can pass waitFor's 2 s default, so allow 10 s (the describe allows 20 s per test).
const SETTLE_MS = 10_000
const base = (): Record<string, Reply> => ({
  'GET /api/admin/cases/c1': { status: 200, body: CASE },
  'GET /api/admin/requests/templates': { status: 200, body: TEMPLATES },
  [`GET ${ESIGN}`]: esign(true),
})
// The existing-request alert links with TanStack Link, so the builder renders inside a minimal memory router.
async function render(extra: Record<string, Reply> = {}) {
  const rootRoute = createRootRoute({
    component: () => <RequestBuilder caseId='c1' onCreated={onCreated} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const out = await renderWithQuery(<RouterProvider router={router} />, { ...base(), ...extra })
  await waitFor(() => !!out.el.querySelector('h1'), SETTLE_MS)
  await waitFor(() => !out.el.querySelector('[data-slot="skeleton"]'), SETTLE_MS)
  return out
}

const rows = (el: HTMLElement) => [...el.querySelectorAll('[data-builder-row]')]
const rowLabels = (el: HTMLElement) =>
  rows(el).map((r) => r.querySelector<HTMLInputElement>('input')!.value)
const checkbox = (el: HTMLElement, i: number) =>
  rows(el)[i].querySelector('[role="checkbox"]')!
const allChecked = (el: HTMLElement) =>
  rows(el).every(
    (r) => r.querySelector('[role="checkbox"]')?.getAttribute('aria-checked') === 'true'
  )
const selectedTemplate = (el: HTMLElement) =>
  el.querySelector('[data-slot="select-trigger"]')?.textContent
async function selectTemplate(el: HTMLElement, name: string) {
  await keyDown(el.querySelector('[data-slot="select-trigger"]')!, 'Enter')
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (o) => o.textContent === name
  )!
  await click(option)
}
const NOT_SET_UP = 'E-sign not set up. An admin maps templates in Settings → Integrations.'
async function openFormMenu(el: HTMLElement) {
  await waitFor(() => !button('Add a form to sign', el)!.disabled, SETTLE_MS)
  await keyDown(button('Add a form to sign', el)!, 'Enter')
  return [...document.querySelectorAll('[role="menuitem"]')]
}

describe('RequestBuilder', { timeout: 20_000 }, () => {
  afterEach(cleanup)

  it('loads the case and defaults to Bank and payroll with both items on', async () => {
    const { el } = await render()
    expect(el.querySelector('h1')?.textContent).toBe('New request for Jordan Rivera')
    expect(selectedTemplate(el)).toContain('Bank and payroll')
    expect(rowLabels(el)).toEqual(['Connect your bank', 'Connect your payroll'])
    expect(allChecked(el)).toBe(true)
  })

  it('falls back to the standard packet where Bank and payroll is not seeded', async () => {
    const templates = TEMPLATES.templates.filter((t) => t.id !== BANK_PAYROLL)
    const { el } = await render({
      'GET /api/admin/requests/templates': { status: 200, body: { templates } },
    })
    expect(selectedTemplate(el)).toContain('Standard resolution packet')
    expect(rowLabels(el)).toHaveLength(5)
  })

  it('posts the enabled items in template order with edited labels', async () => {
    const { el, fetchMock } = await render({
      'POST /api/admin/requests': { status: 201, body: { request_id: 'r9' } },
    })
    await selectTemplate(el, 'Standard resolution packet')
    await click(checkbox(el, 1))
    await type(rows(el)[3].querySelector('input')!, "Driver's license")
    await click(button('Create request', el)!)
    expect(postedBody(fetchMock, '/api/admin/requests')).toEqual({
      case_id: 'c1',
      template_id: STANDARD,
      items: [
        item('bank_connect', 'Connect your bank'),
        item('address', 'Confirm your address'),
        item('upload', "Driver's license", { doc_code: 'government_id' }),
        item('signature', 'Engagement letter', { template: 'engagement_letter' }),
      ],
    })
    expect(onCreated).toHaveBeenCalledWith('r9')
  })

  it('blocks Create request when no item is on', async () => {
    const { el } = await render()
    const n = rows(el).length
    for (let i = 0; i < n; i++) await click(checkbox(el, i))
    expect(button('Create request', el)?.disabled).toBe(true)
    expect(el.textContent).toContain('Choose at least one item.')
  })

  it('switches template and resets the rows', async () => {
    const { el } = await render()
    await click(checkbox(el, 0))
    await selectTemplate(el, 'Documents only')
    expect(rowLabels(el)).toEqual([
      'Government ID',
      'Last 3 bank statements',
      'Last 2 pay stubs',
    ])
    expect(allChecked(el)).toBe(true)
  })

  it('requires a label on every enabled item', async () => {
    const { el } = await render()
    await type(rows(el)[0].querySelector('input')!, '  ')
    expect(el.textContent).toContain('Enter a label.')
    expect(button('Create request', el)?.disabled).toBe(true)
  })

  it('shows Creating… while the request is created', async () => {
    const { el } = await render({ 'POST /api/admin/requests': 'pending' })
    await click(button('Create request', el)!)
    expect(button('Creating…', el)?.disabled).toBe(true)
  })

  it('says the case was not found when the case read is a 404', async () => {
    const { el } = await render({
      'GET /api/admin/cases/c1': {
        status: 404,
        body: { error: { code: 'not_found', message: 'x' } },
      },
    })
    expect(el.textContent).toContain('Case not found')
    expect(el.textContent).toContain('Look the client up again.')
    expect(button('Create request', el)).toBeUndefined()
  })

  it('maps a 404 case_not_found from create to the same copy', async () => {
    const { el } = await render({
      'POST /api/admin/requests': {
        status: 404,
        body: { error: { code: 'case_not_found', message: 'x' } },
      },
    })
    await click(button('Create request', el)!)
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Case not found')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('warns about the existing requests, newest first, each with a link', async () => {
    const { el } = await render({
      'GET /api/admin/cases/c1': { status: 200, body: { ...CASE, requests: EXISTING } },
    })
    const alert = el.querySelector('[role="alert"]')!
    expect(alert.textContent).toContain('A request already exists for this client')
    const lines = [...alert.querySelectorAll('[data-existing-request]')]
    expect(lines.map((l) => l.querySelector('span')?.textContent)).toEqual([
      'Avery Agent · Sent · 2 h ago',
      'Someone · Draft · 30 min ago',
    ])
    expect(lines.map((l) => l.querySelector('a')?.textContent)).toEqual(['View request', 'View request'])
    expect(lines.map((l) => l.querySelector('a')?.getAttribute('href'))).toEqual([
      '/admin/requests/r7',
      '/admin/requests/r8',
    ])
    // A second packet stays allowed.
    expect(button('Create request', el)?.disabled).toBe(false)
  })

  it.each([
    ['no requests key', CASE],
    ['an empty requests list', { ...CASE, requests: [] }],
  ])('shows no existing-request alert with %s', async (_, body) => {
    const { el } = await render({ 'GET /api/admin/cases/c1': { status: 200, body } })
    expect(el.querySelector('[role="alert"]')).toBeNull()
    expect(rowLabels(el)).toHaveLength(2)
  })

  it('lists only mapped forms, disables one already in the request, and never offers 433', async () => {
    const { el } = await render()
    await selectTemplate(el, 'Standard resolution packet')
    expect(rowLabels(el)).toContain('Engagement letter')
    const items = await openFormMenu(el)
    expect(items.map((i) => i.textContent)).toEqual(['Engagement letter', 'Form 2848 (power of attorney)'])
    expect(items[0].getAttribute('aria-disabled')).toBe('true')
    expect(items[1].getAttribute('aria-disabled')).toBeNull()
    expect(document.body.textContent).not.toContain('Form 8821')
    expect(document.body.textContent).not.toMatch(/433/)
  })

  it('appends the chosen form and posts it with its template key', async () => {
    const { el, fetchMock } = await render({
      'POST /api/admin/requests': { status: 201, body: { request_id: 'r9' } },
    })
    const items = await openFormMenu(el)
    await click(items[1])
    expect(rowLabels(el)[2]).toBe('Form 2848 (power of attorney)')
    expect(rows(el)[2].querySelector('[role="checkbox"]')!.getAttribute('aria-checked')).toBe('true')
    await click(button('Create request', el)!)
    const posted = postedBody(fetchMock, '/api/admin/requests') as { items: unknown[] }
    expect(posted.items[2]).toEqual({
      kind: 'signature',
      label: 'Form 2848 (power of attorney)',
      required: true,
      config: { template: 'form_2848' },
    })
  })

  it.each([
    ['not configured', esign(false)],
    ['nothing mapped', esign(true, { engagement_letter: null, form_2848: null, form_8821: null })],
  ])('disables Add a form to sign when %s', async (_, reply) => {
    const { el } = await render({ [`GET ${ESIGN}`]: reply })
    await waitFor(() => el.textContent!.includes(NOT_SET_UP), SETTLE_MS)
    expect(button('Add a form to sign', el)!.disabled).toBe(true)
  })

  it('keeps the builder working when the e-sign settings read fails', async () => {
    const { el, fetchMock } = await render({
      [`GET ${ESIGN}`]: { status: 500, body: { error: { code: 'internal', message: 'x' } } },
      'POST /api/admin/requests': { status: 201, body: { request_id: 'r9' } },
    })
    await waitFor(() => el.textContent!.includes(NOT_SET_UP), SETTLE_MS)
    expect(button('Add a form to sign', el)!.disabled).toBe(true)
    await click(button('Create request', el)!)
    expect(postedBody(fetchMock, '/api/admin/requests')).toBeDefined()
  })
})
