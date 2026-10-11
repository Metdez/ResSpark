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
const item = (kind: string, label: string, config = {}) => ({
  kind,
  label,
  required: true,
  config,
})
const TEMPLATES = {
  templates: [
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
        item('signature', 'Engagement letter'),
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

const onCreated = vi.fn()
const base = (): Record<string, Reply> => ({
  'GET /api/admin/cases/c1': { status: 200, body: CASE },
  'GET /api/admin/requests/templates': { status: 200, body: TEMPLATES },
})
async function render(extra: Record<string, Reply> = {}) {
  const out = await renderWithQuery(
    <RequestBuilder caseId='c1' onCreated={onCreated} />,
    { ...base(), ...extra }
  )
  await waitFor(() => !out.el.querySelector('[data-slot="skeleton"]'))
  return out
}

const rows = (el: HTMLElement) => [...el.querySelectorAll('[data-builder-row]')]
const rowLabels = (el: HTMLElement) =>
  rows(el).map((r) => r.querySelector<HTMLInputElement>('input')!.value)
const checkbox = (el: HTMLElement, i: number) =>
  rows(el)[i].querySelector('[role="checkbox"]')!

describe('RequestBuilder', () => {
  afterEach(cleanup)

  it('loads the case and defaults to the standard packet with every item on', async () => {
    const { el } = await render()
    expect(el.querySelector('h1')?.textContent).toBe('New request for Jordan Rivera')
    expect(el.querySelector('[data-slot="select-trigger"]')?.textContent).toContain(
      'Standard resolution packet'
    )
    expect(rowLabels(el)).toEqual([
      'Connect your bank',
      'Connect your payroll',
      'Confirm your address',
      'Government ID',
      'Engagement letter',
    ])
    expect(
      rows(el).every(
        (r) => r.querySelector('[role="checkbox"]')?.getAttribute('aria-checked') === 'true'
      )
    ).toBe(true)
  })

  it('posts the enabled items in template order with edited labels', async () => {
    const { el, fetchMock } = await render({
      'POST /api/admin/requests': { status: 201, body: { request_id: 'r9' } },
    })
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
        item('signature', 'Engagement letter'),
      ],
    })
    expect(onCreated).toHaveBeenCalledWith('r9')
  })

  it('blocks Create request when no item is on', async () => {
    const { el } = await render()
    for (let i = 0; i < 5; i++) await click(checkbox(el, i))
    expect(button('Create request', el)?.disabled).toBe(true)
    expect(el.textContent).toContain('Choose at least one item.')
  })

  it('switches template and resets the rows', async () => {
    const { el } = await render()
    await click(checkbox(el, 0))
    await keyDown(el.querySelector('[data-slot="select-trigger"]')!, 'Enter')
    const option = [...document.querySelectorAll('[role="option"]')].find(
      (o) => o.textContent === 'Documents only'
    )!
    await click(option)
    expect(rowLabels(el)).toEqual([
      'Government ID',
      'Last 3 bank statements',
      'Last 2 pay stubs',
    ])
    expect(
      rows(el).every(
        (r) => r.querySelector('[role="checkbox"]')?.getAttribute('aria-checked') === 'true'
      )
    ).toBe(true)
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
})
