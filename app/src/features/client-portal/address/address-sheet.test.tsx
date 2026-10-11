import { act } from 'react'
import { QueryClient } from '@tanstack/react-query'
import {
  button,
  cleanup,
  click,
  inputByLabel,
  postedBody,
  renderWithQuery,
  type Reply,
  type,
  waitFor,
} from '@/test-utils/query-render'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PortalStep } from '../portal-api'
import { AddressSheet } from './address-sheet'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const STEP: PortalStep = { id: 'I1', position: 1, kind: 'address', label: 'Confirm your address', required: true, status: 'pending' }
const SUGGEST = '/api/c/address/suggest?q='
const POST = 'POST /api/c/items/I1/address'
const AMPH = { street_line: '1600 Amphitheatre Pkwy', secondary: '', city: 'Mountain View', state: 'CA', zipcode: '94043', entries: 0 }
const ORem = { street_line: '1042 W Center St', secondary: 'Apt', city: 'Orem', state: 'UT', zipcode: '84057', entries: 3 }
const UNITS = ['Apt 1', 'Apt 2', 'Apt 3'].map((secondary) => ({ ...ORem, secondary, entries: 1 }))
const SELECTED = 'selected=1042%20W%20Center%20St%20Apt%20(3)%20Orem%20UT%2084057'
const result = (needs_unit = false) => ({
  status: 200,
  body: {
    address: { line1: AMPH.street_line, line2: null, city: AMPH.city, state_code: 'CA', zip5: '94043', zip4: null },
    verified: !needs_unit,
    dpv: needs_unit ? 'D' : 'Y',
    needs_unit,
    item_status: 'submitted',
    request_status: 'waiting_on_staff',
  },
})
const ok = (suggestions: unknown[]): Reply => ({ status: 200, body: { suggestions } })
const err = (status: number, code: string): Reply => ({ status, body: { error: { code } } })

const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries')

const text = () => document.body.textContent ?? ''
const search = () => inputByLabel('Home address')
const suggestions = () => [...document.querySelectorAll<HTMLButtonElement>('[data-suggestion]')]
const noCounty = () => expect(text()).not.toMatch(/county/i)

async function open(replies: Record<string, Reply>) {
  const r = await renderWithQuery(
    <AddressSheet step={STEP} open onClose={() => {}} />,
    replies
  )
  return r.fetchMock
}

async function searchFor(q: string, replies: Record<string, Reply>) {
  const f = await open(replies)
  await type(search(), q)
  return f
}

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('AddressSheet search and confirm', () => {
  it('focuses a 16 px Home address input in a full-height bottom sheet', async () => {
    await open({})
    expect(document.activeElement).toBe(search())
    expect(search().className).toContain('text-base')
    expect(document.querySelector('[role="dialog"]')!.className).toContain('h-dvh')
    noCounty()
  })

  it('makes no request under 3 characters', async () => {
    const f = await searchFor('16', {})
    await act(async () => new Promise((r) => setTimeout(r, 300)))
    expect(f).not.toHaveBeenCalled()
  })

  it('waits 250 ms after typing before the one request', async () => {
    const f = await open({ [`GET ${SUGGEST}160`]: ok([AMPH]) })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await type(search(), '160')
    await act(async () => vi.advanceTimersByTime(249))
    expect(f).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(1))
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('shows at most 5 suggestion rows, each at least 44 px', async () => {
    await searchFor('1600 Amph', { [`GET ${SUGGEST}1600%20Amph`]: ok(Array.from({ length: 7 }, () => AMPH)) })
    await waitFor(() => suggestions().length > 0)
    expect(suggestions()).toHaveLength(5)
    for (const b of suggestions()) expect(b.className).toContain('min-h-11')
  })

  it('a pick shows the confirm card with the standardized address', async () => {
    await searchFor('1600 Amph', { [`GET ${SUGGEST}1600%20Amph`]: ok([AMPH]) })
    await waitFor(() => suggestions().length > 0)
    await click(suggestions()[0])
    expect(text()).toContain('Is this your home address?')
    expect(text()).toContain('1600 Amphitheatre Pkwy')
    expect(text()).toContain('Mountain View, CA 94043')
    noCounty()
  })

  it('Yes posts the pick, shows done, and refetches the portal state', async () => {
    const f = await searchFor('1600 Amph', { [`GET ${SUGGEST}1600%20Amph`]: ok([AMPH]), [POST]: result() })
    await waitFor(() => suggestions().length > 0)
    await click(suggestions()[0])
    await click(button("Yes, that's my address")!)
    await waitFor(() => text().includes('Address saved. Your agent has it.'))
    expect(postedBody(f, '/api/c/items/I1/address')).toEqual({
      source: 'smarty',
      street_line: AMPH.street_line,
      city: AMPH.city,
      state: 'CA',
      zipcode: '94043',
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['portal', 'state'] })
    noCounty()
  })

  it('No, search again returns to the input with the text kept', async () => {
    await searchFor('1600 Amph', { [`GET ${SUGGEST}1600%20Amph`]: ok([AMPH]) })
    await waitFor(() => suggestions().length > 0)
    await click(suggestions()[0])
    await click(button('No, search again')!)
    expect(search().value).toBe('1600 Amph')
  })

  it('a failed save stays on the card with a toast', async () => {
    await searchFor('1600 Amph', { [`GET ${SUGGEST}1600%20Amph`]: ok([AMPH]), [POST]: err(409, 'item_approved') })
    await waitFor(() => suggestions().length > 0)
    await click(suggestions()[0])
    await click(button("Yes, that's my address")!)
    await waitFor(() => toastError.mock.calls.length > 0)
    expect(toastError).toHaveBeenCalledWith('Something went wrong. Try again.')
    expect(text()).toContain('Is this your home address?')
  })
})

describe('AddressSheet units and the unit prompt', () => {
  const replies = (post: Reply = result()) => ({
    [`GET ${SUGGEST}1042%20W`]: ok([ORem]),
    [`GET ${SUGGEST}1042%20W&${SELECTED}`]: ok(UNITS),
    [POST]: post,
  })

  it('a multi-unit suggestion lists its units through a selected call', async () => {
    await searchFor('1042 W', replies())
    await waitFor(() => suggestions().length > 0)
    expect(text()).toContain('3 units at this address')
    await click(suggestions()[0])
    await waitFor(() => text().includes('Choose your unit') && text().includes('Apt 3'))
    expect(suggestions()).toHaveLength(3)
  })

  it('picking a unit goes to the confirm card', async () => {
    await searchFor('1042 W', replies())
    await waitFor(() => suggestions().length > 0)
    await click(suggestions()[0])
    await waitFor(() => text().includes('Apt 2'))
    await click(suggestions()[1])
    expect(text()).toContain('Is this your home address?')
    expect(text()).toContain('1042 W Center St Apt 2')
  })

  async function toPrompt(f: Record<string, Reply>) {
    const fetchMock = await searchFor('1600 Amph', { [`GET ${SUGGEST}1600%20Amph`]: ok([AMPH]), ...f })
    await waitFor(() => suggestions().length > 0)
    await click(suggestions()[0])
    await click(button("Yes, that's my address")!)
    await waitFor(() => text().includes('Add your apartment or unit number.'))
    return fetchMock
  }

  it('needs_unit prompts once; a unit re-posts with secondary; a second D/S answer is done', async () => {
    const f = await toPrompt({ [POST]: result(true) })
    await type(inputByLabel('Apartment or unit'), 'Apt 4')
    await click(button('Save')!)
    await waitFor(() => text().includes('Address saved. Your agent has it.'))
    const posts = f.mock.calls.filter(([, init]) => (init as RequestInit).method === 'POST')
    expect(posts).toHaveLength(2)
    expect(JSON.parse(String((posts[1][1] as RequestInit).body))).toMatchObject({ secondary: 'Apt 4' })
  })

  it("I don't have one goes to done with no second POST", async () => {
    const f = await toPrompt({ [POST]: result(true) })
    await click(button("I don't have one")!)
    expect(text()).toContain('Address saved. Your agent has it.')
    expect(f.mock.calls.filter(([, init]) => (init as RequestInit).method === 'POST')).toHaveLength(1)
  })
})

describe('AddressSheet manual fallback', () => {
  const manualShown = () => text().includes('Enter your address') && !!inputByLabel('Street address')

  it("I can't find my address opens the manual form with no notice", async () => {
    await open({})
    await click(button("I can't find my address")!)
    expect(manualShown()).toBe(true)
    expect(text()).not.toContain('Enter your address below.')
    noCounty()
  })

  it('a 503 provider_not_configured opens the manual form with its notice', async () => {
    await searchFor('1600', { [`GET ${SUGGEST}1600`]: err(503, 'provider_not_configured') })
    await waitFor(manualShown)
    expect(text()).toContain('Enter your address below.')
    noCounty()
  })

  it('a 502 opens the manual form with the lookup-failed notice', async () => {
    await searchFor('1600', { [`GET ${SUGGEST}1600`]: err(502, 'provider_error') })
    await waitFor(manualShown)
    expect(text()).toContain("We couldn't look up addresses right now. Enter your address below.")
  })

  it('a confirm 422 address_unverifiable opens the manual form', async () => {
    await searchFor('1600 Amph', { [`GET ${SUGGEST}1600%20Amph`]: ok([AMPH]), [POST]: err(422, 'address_unverifiable') })
    await waitFor(() => suggestions().length > 0)
    await click(suggestions()[0])
    await click(button("Yes, that's my address")!)
    await waitFor(manualShown)
    expect(text()).toContain("We couldn't confirm that address. Enter it below.")
    noCounty()
  })

  it('a 429 keeps the current list and shows no form', async () => {
    await searchFor('1600 Amph', {
      [`GET ${SUGGEST}1600%20Amph`]: ok([AMPH]),
      [`GET ${SUGGEST}1600%20Amphi`]: err(429, 'rate_limited'),
    })
    await waitFor(() => suggestions().length > 0)
    await type(search(), '1600 Amphi')
    await act(async () => new Promise((r) => setTimeout(r, 400)))
    expect(suggestions()).toHaveLength(1)
    expect(text()).not.toContain('Street address')
  })
})
