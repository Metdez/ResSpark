import { act } from 'react'
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
import { ManualAddressForm } from './manual-address-form'

const PATH = '/api/c/items/I1/address'
const OK: Reply = {
  status: 200,
  body: {
    address: { line1: '1 Main St', line2: null, city: 'Springfield', state_code: 'IL', zip5: '62701', zip4: null },
    verified: false,
    dpv: null,
    needs_unit: false,
    item_status: 'submitted',
    request_status: 'waiting_on_staff',
  },
}
const text = () => document.body.textContent ?? ''
const state = () => inputByLabel('State') as unknown as HTMLSelectElement

async function render(reply?: Reply) {
  const onSaved = vi.fn()
  const r = await renderWithQuery(
    <ManualAddressForm itemId='I1' notice={null} onSaved={onSaved} />,
    reply ? { [`POST ${PATH}`]: reply } : {}
  )
  return { onSaved, fetchMock: r.fetchMock }
}

async function fill(unit = '') {
  await type(inputByLabel('Street address'), '1 Main St')
  if (unit) await type(inputByLabel('Apartment or unit (optional)'), unit)
  await type(inputByLabel('City'), 'Springfield')
  await act(async () => {
    state().value = 'IL'
    state().dispatchEvent(new Event('change', { bubbles: true }))
  })
  await type(inputByLabel('ZIP code'), '62701')
}

afterEach(cleanup)

describe('ManualAddressForm', () => {
  it('lists the 50 states and DC, and no county field', async () => {
    await render()
    const names = [...state().options].filter((o) => o.value).map((o) => o.text)
    expect(names).toHaveLength(51)
    expect(names).toContain('District of Columbia')
    expect(text()).not.toMatch(/county/i)
  })

  it('submitting empty shows the four field errors', async () => {
    const { fetchMock } = await render()
    await click(button('Save address')!)
    for (const e of ['Enter your street address.', 'Enter your city.', 'Choose your state.', 'Enter a 5-digit ZIP code.'])
      expect(text()).toContain(e)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a 4-digit ZIP is rejected', async () => {
    await render()
    await fill()
    await type(inputByLabel('ZIP code'), '1234')
    await click(button('Save address')!)
    expect(text()).toContain('Enter a 5-digit ZIP code.')
    expect(inputByLabel('ZIP code').maxLength).toBe(5)
  })

  it('posts a manual body without unit when blank and calls onSaved', async () => {
    const { fetchMock, onSaved } = await render(OK)
    await fill()
    await click(button('Save address')!)
    await waitFor(() => onSaved.mock.calls.length > 0)
    expect(postedBody(fetchMock, PATH)).toEqual({ source: 'manual', street: '1 Main St', city: 'Springfield', state: 'IL', zip5: '62701' })
  })

  it('includes the unit when filled', async () => {
    const { fetchMock, onSaved } = await render(OK)
    await fill('Apt 2')
    await click(button('Save address')!)
    await waitFor(() => onSaved.mock.calls.length > 0)
    expect(postedBody(fetchMock, PATH)).toMatchObject({ unit: 'Apt 2' })
  })

  it('reads Saving… and is disabled while pending', async () => {
    await render('pending')
    await fill()
    await click(button('Save address')!)
    const b = button('Saving…')!
    expect(b.disabled).toBe(true)
  })

  it('a 409 item_approved shows the save-failed copy', async () => {
    const { onSaved } = await render({ status: 409, body: { error: { code: 'item_approved' } } })
    await fill()
    await click(button('Save address')!)
    await waitFor(() => text().includes('Something went wrong. Try again.'))
    expect(onSaved).not.toHaveBeenCalled()
  })
})
