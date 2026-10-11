import { describe, expect, it } from 'vitest'
import { StandardsLookupError } from '../engine/standards'
import { BundleStandardsRepository, isStandardsBundle, type StandardsBundle } from './bundle-repository'

// Test data only: amounts are arbitrary, the point is which inputs the repository accepts.
const BUNDLE: StandardsBundle = {
  state: 'CA',
  county: 'Los Angeles County',
  household_size: 2,
  vehicle_count: 1,
  national: 1000,
  health_under_65: 90,
  health_65_plus: 160,
  transportation_area: 'Los Angeles',
  ownership: 700,
  operating: 300,
  housing: 3000,
}
const repo = (over: Partial<StandardsBundle> = {}) => new BundleStandardsRepository({ ...BUNDLE, ...over })

describe('BundleStandardsRepository', () => {
  it('returns the bundle values for the inputs it was fetched for', () => {
    const r = repo()
    expect(r.nationalAmount(2)).toBe(1000)
    expect(r.healthCareAmount(30)).toBe(90)
    expect(r.healthCareAmount(65)).toBe(160)
    expect(r.transportationArea('CA', 'Los Angeles County')).toBe('Los Angeles')
    expect(r.transportationOwnershipAmount(1)).toBe(700)
    expect(r.transportationOperatingAmount('Los Angeles', 1)).toBe(300)
    expect(r.housingAmount('CA', 'Los Angeles County', 2)).toBe(3000)
  })

  it.each([
    ['household mismatch', () => repo().nationalAmount(3)],
    ['household mismatch on housing', () => repo().housingAmount('CA', 'Los Angeles County', 3)],
    ['vehicle mismatch', () => repo().transportationOwnershipAmount(2)],
    ['vehicle mismatch on operating', () => repo().transportationOperatingAmount('Los Angeles', 2)],
    ['age 40', () => repo().healthCareAmount(40)],
    ['area mismatch', () => repo().transportationOperatingAmount('Miami', 1)],
    ['county mismatch', () => repo().transportationArea('CA', 'Orange County')],
    ['null housing', () => repo({ housing: null }).housingAmount('CA', 'Los Angeles County', 2)],
    ['null area', () => repo({ transportation_area: null }).transportationArea('CA', 'Los Angeles County')],
  ])('throws StandardsLookupError on %s', (_name, lookup) => {
    expect(lookup).toThrow(StandardsLookupError)
  })

  it('uses the Python wording', () => {
    expect(() => repo({ housing: null }).housingAmount('CA', 'Los Angeles County', 2)).toThrow(
      'No housing standard found for supplied values.'
    )
  })

  it('a 0-vehicle bundle answers the engine operating call with its operating value', () => {
    const r = repo({ vehicle_count: 0, transportation_area: '', ownership: 0, operating: 0 })
    expect(r.transportationOperatingAmount('', 0)).toBe(0)
    expect(r.transportationOwnershipAmount(0)).toBe(0)
  })
})

describe('isStandardsBundle', () => {
  it('accepts numbers or null for amounts and a string or null area', () => {
    expect(isStandardsBundle(BUNDLE)).toBe(true)
    expect(isStandardsBundle({ ...BUNDLE, housing: null, transportation_area: null })).toBe(true)
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a string amount', { ...BUNDLE, housing: '3000' }],
    ['a fractional household', { ...BUNDLE, household_size: 1.5 }],
    ['a missing state', { ...BUNDLE, state: undefined }],
    ['a numeric area', { ...BUNDLE, transportation_area: 3 }],
  ])('rejects %s', (_name, value) => {
    expect(isStandardsBundle(value)).toBe(false)
  })
})
