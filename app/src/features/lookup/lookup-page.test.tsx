import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  cleanup,
  click,
  inputByLabel,
  postedBody,
  renderWithQuery,
  type,
  waitFor,
  type Reply,
} from '@/test-utils/query-render'
import { LookupPage } from './lookup-page'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

const summary = (over: Record<string, unknown>) => ({
  logics_case_id: 900001,
  first_name: 'Jordan',
  last_name: 'Rivera',
  status_id: 191,
  created_date: '2026-08-14T15:02:11',
  cell_phone: '(555)010-0001',
  home_phone: null,
  work_phone: null,
  email: 'jordan.rivera@example.com',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  language: null,
  matched_field: 'cell',
  ...over,
})
const TWO = [
  summary({}),
  summary({
    logics_case_id: 900002,
    first_name: 'Casey',
    created_date: '2026-09-02T09:30:00',
    cell_phone: null,
    home_phone: '5550100001',
    email: 'casey.rivera@example.com',
    matched_field: 'home',
  }),
]
const LOOKUP = 'POST /api/admin/lookup'
const err = (status: number, code: string): Reply => ({
  status,
  body: { error: { code, message: 'x' } },
})

const onConfirmed = vi.fn()
const PHONE = '(555) 010-0001'

async function render(replies: Record<string, Reply> = {}) {
  const out = await renderWithQuery(
    <LookupPage onConfirmed={onConfirmed} />,
    replies
  )
  return out
}
const field = () => inputByLabel('Case ID, phone, or email')
async function search(el: HTMLElement, value = PHONE) {
  await type(field(), value)
  await click(button('Search', el)!)
  await waitFor(() => !button('Searching…', el))
}

describe('LookupPage', () => {
  afterEach(cleanup)

  it('renders the title, the one input, the neutral helper, and a disabled Search', async () => {
    const { el } = await render()
    expect(el.querySelector('h1')?.textContent).toBe('Find a client')
    expect(field()).not.toBeNull()
    expect(el.textContent).toContain('Enter a case ID, a phone number, or an email.')
    expect(button('Search', el)?.disabled).toBe(true)
  })

  it('detects a phone number and offers the optional last name', async () => {
    const { el } = await render()
    await type(field(), PHONE)
    expect(el.textContent).toContain('Searching by phone number')
    expect(inputByLabel('Last name (optional)')).not.toBeNull()
    expect(button('Search', el)?.disabled).toBe(false)
  })

  it('detects an email and hides the last name', async () => {
    const { el } = await render()
    await type(field(), PHONE)
    await type(field(), 'morgan.lee@example.com')
    expect(el.textContent).toContain('Searching by email')
    expect(el.textContent).not.toContain('Last name (optional)')
  })

  it('detects a case ID', async () => {
    const { el } = await render()
    await type(field(), '900001')
    expect(el.textContent).toContain('Searching by case ID')
  })

  it('keeps Search disabled for input it cannot classify', async () => {
    const { el } = await render()
    await type(field(), 'Jordan')
    expect(el.textContent).toContain('Enter a case ID, a phone number, or an email.')
    expect(button('Search', el)?.disabled).toBe(true)
  })

  it('posts the detected type and value, and last_name only when filled', async () => {
    const { el, fetchMock } = await render({
      [LOOKUP]: { status: 200, body: { results: [], mode: 'live' } },
    })
    await search(el)
    expect(postedBody(fetchMock, '/api/admin/lookup')).toEqual({
      type: 'phone',
      value: PHONE,
    })
    fetchMock.mockClear()
    await type(inputByLabel('Last name (optional)'), 'Rivera')
    await click(button('Search', el)!)
    expect(postedBody(fetchMock, '/api/admin/lookup')).toEqual({
      type: 'phone',
      value: PHONE,
      last_name: 'Rivera',
    })
  })

  it('renders one confirm card per result, in order, with the fixture notice', async () => {
    const { el } = await render({
      [LOOKUP]: { status: 200, body: { results: TWO, mode: 'fake' } },
    })
    await search(el)
    const cards = [...el.querySelectorAll('[data-case-card]')]
    expect(cards).toHaveLength(2)
    const first = cards[0].textContent!
    for (const s of [
      'Jordan Rivera',
      'Case 900001',
      'Status 191',
      'Created Aug 14, 2026',
      'Austin, TX',
      '(•••) •••-0001',
      'jordan.rivera@example.com',
      'Matched cell phone',
      'Yes, this is the client',
    ])
      expect(first).toContain(s)
    expect(cards[1].textContent).toContain('Casey Rivera')
    expect(cards[1].textContent).toContain('Matched home phone')
    expect(el.textContent).toContain('Using built-in test cases')
  })

  it('shows no fixture notice in live mode', async () => {
    const { el } = await render({
      [LOOKUP]: { status: 200, body: { results: TWO, mode: 'live' } },
    })
    await search(el)
    expect(el.textContent).not.toContain('Using built-in test cases')
  })

  it('shows the empty block naming the search type when nothing matches', async () => {
    const { el } = await render({
      [LOOKUP]: { status: 200, body: { results: [], mode: 'fake' } },
    })
    await search(el)
    expect(el.textContent).toContain('No matching case')
    expect(el.textContent).toContain(
      'Check the phone number and search again, or ask the client for another contact.'
    )
    expect(el.querySelector('[data-case-card]')).toBeNull()
  })

  it('confirms one card at a time: Confirming… and the other card disabled', async () => {
    const { el, fetchMock } = await render({
      [LOOKUP]: { status: 200, body: { results: TWO, mode: 'fake' } },
      'POST /api/admin/cases/900001/confirm': 'pending',
    })
    await search(el)
    const cards = [...el.querySelectorAll<HTMLElement>('[data-case-card]')]
    await click(button('Yes, this is the client', cards[0])!)
    expect(postedBody(fetchMock, '/api/admin/cases/900001/confirm')).toEqual({
      search_type: 'phone',
    })
    expect(button('Confirming…', cards[0])?.disabled).toBe(true)
    expect(button('Yes, this is the client', cards[1])?.disabled).toBe(true)
  })

  it('hands the confirmed case_id to onConfirmed', async () => {
    const { el } = await render({
      [LOOKUP]: { status: 200, body: { results: TWO, mode: 'fake' } },
      'POST /api/admin/cases/900001/confirm': {
        status: 200,
        body: {
          case_id: '11111111-1111-4111-8111-111111111111',
          logics_case_id: 900001,
          first_name: 'Jordan',
          last_name: 'Rivera',
          email: 'jordan.rivera@example.com',
          phone_e164: '+15550100001',
        },
      },
    })
    await search(el)
    const card = el.querySelector<HTMLElement>('[data-case-card]')!
    await click(button('Yes, this is the client', card)!)
    await waitFor(() => onConfirmed.mock.calls.length > 0)
    expect(onConfirmed).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })

  it('explains a Logics that is not configured', async () => {
    const { el } = await render({ [LOOKUP]: err(409, 'logics_not_configured') })
    await search(el)
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Logics is not configured'
    )
  })

  it('explains an unreachable Logics', async () => {
    const { el } = await render({ [LOOKUP]: err(502, 'logics_unreachable') })
    await search(el)
    expect(el.textContent).toContain("Couldn't reach Logics")
  })

  it('shows phone_invalid inline under the input', async () => {
    const { el } = await render({ [LOOKUP]: err(400, 'phone_invalid') })
    await search(el)
    expect(field().getAttribute('aria-invalid')).toBe('true')
    expect(el.textContent).toContain('Enter a 10-digit US phone number.')
    expect(el.querySelector('[role="alert"]')).toBeNull()
  })
})
