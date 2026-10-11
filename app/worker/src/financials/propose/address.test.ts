import { afterEach, describe, expect, it, vi } from 'vitest'
import { smartyConfigured, verifyStreet, type VerifiedAddress } from '../../integrations/smarty/client'
import { lookupCountyFips } from '../county'
import { proposeAddress } from './address'
import type { ProposeContext } from './run'

vi.mock('../../integrations/smarty/client', () => ({ smartyConfigured: vi.fn(), verifyStreet: vi.fn() }))
vi.mock('../county', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../county')>()),
  lookupCountyFips: vi.fn(),
}))

const MANUAL = { address_source: 'manual', address_line1: '12 Main St', city: 'Austin', state_code: 'TX', zip5: '78701', address_confirmed_at: '2026-10-01T00:00:00Z' }
const LOGICS = { CaseID: 900001, Address: '100 Congress Ave', AptNo: '', City: 'Austin', State: 'TX', Zip: '78701' }
const TRAVIS = { state: 'Texas', county: 'Travis County', note: null }
const hit = (fips: string | null, state = 'TX') => ({ line1: 'x', county_fips: fips, state_code: state }) as VerifiedAddress

const ctx = (caseRow: Record<string, unknown>, info: Record<string, unknown> | null = null): ProposeContext => ({
  env: {} as Env,
  firmId: 'F1',
  caseId: 'C1',
  caseRow,
  settings: { window_months: 3, spouse_employer_ids: [] },
  window: { start: '2026-07-01', end: '2026-09-30', months: 3 },
  now: new Date('2026-10-11T00:00:00Z'),
  logicsCaseInfo: vi.fn(async () => info as never),
})

afterEach(() => vi.resetAllMocks())

describe('proposeAddress, confirmed Smarty address', () => {
  const confirmed = (fips: string) => ({ address_source: 'smarty', address_confirmed_at: 'x', county_fips: fips, state_code: 'CT', county_name: 'Hartford' })

  it('old Connecticut county: state only', async () => {
    vi.mocked(lookupCountyFips).mockResolvedValue({ state: 'Connecticut', county: null, note: 'n' })
    const out = await proposeAddress(ctx(confirmed('09003')))
    expect(out!.proposals.map((p) => p.canonical_column)).toEqual(['state_of_residence'])
    expect(verifyStreet).not.toHaveBeenCalled()
  })

  it('FIPS not in the IRS table: Smarty county name with reliability C', async () => {
    vi.mocked(lookupCountyFips).mockResolvedValue('unmapped')
    const out = await proposeAddress(ctx(confirmed('99999')))
    expect(out!.proposals[1]).toMatchObject({ proposed_value: 'Hartford', reliability: 'C', method: 'smarty_county_name_not_in_irs_table' })
  })
})

describe('proposeAddress, fallback', () => {
  it('Smarty not configured: null', async () => {
    vi.mocked(smartyConfigured).mockReturnValue(false)
    expect(await proposeAddress(ctx(MANUAL, LOGICS))).toBeNull()
  })

  it('verifies the manual address first; a mapped hit is state and county, reliability B', async () => {
    vi.mocked(smartyConfigured).mockReturnValue(true)
    vi.mocked(verifyStreet).mockResolvedValue(hit('48453'))
    vi.mocked(lookupCountyFips).mockResolvedValue(TRAVIS)
    const c = ctx(MANUAL, LOGICS)
    const out = await proposeAddress(c)
    expect(verifyStreet).toHaveBeenCalledTimes(1)
    expect(vi.mocked(verifyStreet).mock.calls[0][1]).toMatchObject({ street: '12 Main St', zipcode: '78701' })
    expect(c.logicsCaseInfo).not.toHaveBeenCalled()
    expect(out!.proposals).toEqual([
      expect.objectContaining({ canonical_column: 'state_of_residence', proposed_value: 'TX', reliability: 'B', method: 'manual_address_smarty_fips' }),
      expect.objectContaining({ canonical_column: 'county_of_residence', proposed_value: 'Travis County', reliability: 'B' }),
    ])
    expect(JSON.stringify(out)).not.toContain('Main St')
  })

  it('manual address does not verify: tries the Logics address', async () => {
    vi.mocked(smartyConfigured).mockReturnValue(true)
    vi.mocked(verifyStreet).mockResolvedValueOnce(null).mockResolvedValueOnce(hit('48453'))
    vi.mocked(lookupCountyFips).mockResolvedValue(TRAVIS)
    const out = await proposeAddress(ctx(MANUAL, LOGICS))
    expect(vi.mocked(verifyStreet).mock.calls[1][1]).toMatchObject({ street: '100 Congress Ave', secondary: null, city: 'Austin' })
    expect(out!.proposals[0]).toMatchObject({ method: 'logics_address_smarty_fips', source_refs: [{ kind: 'logics_field', id: 'Address' }] })
    expect(JSON.stringify(out)).not.toContain('Congress')
  })

  it('nothing verifies: [] (no proposal from absence)', async () => {
    vi.mocked(smartyConfigured).mockReturnValue(true)
    vi.mocked(verifyStreet).mockResolvedValue(null)
    expect(await proposeAddress(ctx(MANUAL, LOGICS))).toEqual({ source: 'address', proposals: [] })
  })

  it('a hit whose FIPS is not mapped to a county proposes nothing', async () => {
    vi.mocked(smartyConfigured).mockReturnValue(true)
    vi.mocked(verifyStreet).mockResolvedValue(hit('09003'))
    vi.mocked(lookupCountyFips).mockResolvedValue({ state: 'Connecticut', county: null, note: null })
    expect((await proposeAddress(ctx(MANUAL)))!.proposals).toEqual([])
  })

  it('no address at all: [] without calling Smarty', async () => {
    vi.mocked(smartyConfigured).mockReturnValue(true)
    expect(await proposeAddress(ctx({}, { CaseID: 1, Address: '' }))).toEqual({ source: 'address', proposals: [] })
    expect(verifyStreet).not.toHaveBeenCalled()
  })
})
