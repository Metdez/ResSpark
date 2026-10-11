import { describe, expect, it } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { fetchStandardsBundle } from '../src/financials/rpc'

// D-11 and open question 1 against the live standards tables (read-only).
// Run with `pnpm -C app run test:live:file worker/test/standards-bundle.test.ts`.
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
if (!live) process.stderr.write('standards bundle suite skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY\n')

describe.skipIf(!live)('standards bundle (live)', () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY } as unknown as Env
  const bundle = (state: string, county: string, householdSize: number, vehicleCount: number) =>
    fetchStandardsBundle(env, { state, county, householdSize, vehicleCount }) as Promise<Record<string, unknown>>

  it('Los Angeles County, 1 person, 0 vehicles', async () => {
    expect(await bundle('CA', 'Los Angeles County', 1, 0)).toMatchObject({
      housing: 3001,
      transportation_area: '',
      operating: 0,
      ownership: 0,
      health_under_65: 90,
      health_65_plus: 163,
      national: 867,
    })
  })

  it('Miami-Dade County, 1 vehicle', async () => {
    expect(await bundle('FL', 'Miami-Dade County', 1, 1)).toMatchObject({
      transportation_area: 'Miami',
      operating: 423,
      ownership: 703,
    })
  })

  it('national standard for a household of 6, and an unknown county has no housing', async () => {
    expect((await bundle('CA', 'Los Angeles County', 6, 0)).national).toBe(2970)
    expect((await bundle('CA', 'Nowhere County', 1, 0)).housing).toBeNull()
  })

  it('Connecticut planning regions carry the IRS names with unchanged amounts', async () => {
    const regions: Array<[string, number]> = [
      ['Lower Connecticut River Valley Planning Region', 2388],
      ['Northeastern Connecticut Planning Region', 2026],
      ['South Central Connecticut Planning Region', 2359],
      ['Southeastern Connecticut Planning Region', 2157],
    ]
    for (const [county, amount] of regions) {
      expect((await bundle('CT', county, 1, 0)).housing, county).toBe(amount)
    }
    const { count } = await createAdminClient(env)
      .from('housing_utilities_standards')
      .select('*', { count: 'exact', head: true })
      .eq('state', 'Connecticut')
      .in('county', ['Region', 'Planning Region'])
    expect(count).toBe(0)
  })
})
