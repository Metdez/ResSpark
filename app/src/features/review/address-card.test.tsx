import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { AddressCard } from './address-card'
import type { CaseAddressView } from './api'

const VERIFIED: CaseAddressView = {
  line1: '1600 Amphitheatre Pkwy', line2: null, city: 'Mountain View', state_code: 'CA', zip5: '94043', zip4: '1351',
  county_name: 'Santa Clara', county_fips: '06085', rdi: 'Commercial', dpv: 'Y', verified: true, source: 'smarty',
  confirmed_at: '2026-10-11T08:00:00Z',
}
const MANUAL: CaseAddressView = {
  ...VERIFIED, zip4: null, county_name: null, county_fips: null, rdi: null, dpv: null, verified: false, source: 'manual',
}

let root: Root | undefined
let el: HTMLDivElement
async function render(address: CaseAddressView | null) {
  el = document.createElement('div')
  document.body.append(el)
  root = createRoot(el)
  await act(async () => root!.render(<AddressCard address={address} />))
  return el.textContent ?? ''
}
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

describe('AddressCard', () => {
  it('a verified Smarty address shows lines, county and FIPS, RDI, chip, source and time', async () => {
    const t = await render(VERIFIED)
    for (const s of ['1600 Amphitheatre Pkwy', 'Mountain View, CA 94043-1351', 'Santa Clara County (06085)', 'Commercial', 'USPS verified', 'Source: Smarty'])
      expect(t).toContain(s)
    expect(el.querySelector('[title="2026-10-11T08:00:00Z"]')).not.toBeNull()
  })

  it.each([
    ['Los Angeles', 'Los Angeles County'],
    ['Richmond City', 'Richmond City'],
    ['Orleans Parish', 'Orleans Parish'],
    ['Anchorage Municipality', 'Anchorage Municipality'],
    ['Juneau City and Borough', 'Juneau City and Borough'],
  ])('county %s is labelled %s', async (county_name, label) => {
    const t = await render({ ...VERIFIED, county_name })
    expect(t).toContain(`${label} (06085)`)
    expect(t).not.toContain(`${label} County`)
  })

  it('null shows the not-yet copy', async () => {
    expect(await render(null)).toBe("The client hasn't confirmed an address yet.")
  })

  it('renders no select, combobox, or listbox', async () => {
    await render(VERIFIED)
    expect(el.querySelector('select, [role="combobox"], [role="listbox"]')).toBeNull()
  })

  it('a manual address is unverified with no county line', async () => {
    const t = await render(MANUAL)
    expect(t).toContain('Unverified — county unknown')
    expect(t).toContain('Source: entered by client')
    expect(t).not.toMatch(/County \(/)
  })

  it('an unverified Smarty address with DPV D flags the unit', async () => {
    const t = await render({ ...VERIFIED, verified: false, dpv: 'D' })
    expect(t).toContain('Unverified')
    expect(t).not.toContain('USPS verified')
    expect(t).toContain('Unit missing or not recognized')
  })
})
