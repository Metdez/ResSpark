import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { countyBlock, lookupCountyFips } from '../src/financials/county'
import { runFinancialsPropose } from '../src/financials/propose/run'
import { queue, type Job } from '../src/jobs/index'
import { seedFinancialCase, TEST_FIRM, type FinancialFixture } from './fixtures/financials'

// FORM-03 / ADDR-02 against the live project: case address -> financials_propose -> proposals.
// Run with `pnpm -C app run test:live:file worker/test/financials-propose.test.ts`.
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
if (!live) process.stderr.write('financials propose suite skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY\n')

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose row JSON in assertions only
type Json = Record<string, any>

describe.skipIf(!live)('financials_propose (live)', () => {
  // Fake Logics (case 900001 fixtures); no Smarty keys, so the address fallback is skipped.
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY, LOGICS_MODE: 'fake' } as unknown as Env
  const NOW = new Date('2026-10-11T12:00:00Z')
  let db: SupabaseClient
  const fixtures: FinancialFixture[] = []

  // A case whose client confirmed a USPS (Smarty) address with this FIPS.
  const seedConfirmed = async (fips: string, countyName: string, state = 'CA', opts: { logicsCaseId?: number } = {}) => {
    const fx = await seedFinancialCase(env, opts)
    fixtures.push(fx)
    const { error } = await db
      .from('cases')
      .update({
        address_line1: '1 Test St',
        city: 'Testville',
        state_code: state,
        zip5: '90012',
        county_name: countyName,
        county_fips: fips,
        address_verified: true,
        address_source: 'smarty',
        address_confirmed_at: new Date().toISOString(),
      })
      .eq('id', fx.caseId)
    if (error) throw new Error(error.message)
    return fx
  }
  const open = async (caseId: string, source: string) =>
    ((await db.from('financial_proposals').select('*').eq('case_id', caseId).eq('source', source).eq('status', 'proposed')).data ?? []) as Json[]
  const valueOf = (rows: Json[], column: string) => rows.find((r) => r.canonical_column === column)

  beforeAll(() => {
    db = createAdminClient(env)
  })
  afterAll(async () => {
    for (const fx of fixtures) await fx.cleanup()
  })

  it('a confirmed FIPS 06037 address proposes CA and Los Angeles County, idempotently', async () => {
    const fx = await seedConfirmed('06037', 'Los Angeles')
    const first = await runFinancialsPropose(env, fx.caseId)
    expect(first.address).toMatchObject({ inserted: 2 })
    const rows = await open(fx.caseId, 'address')
    expect(rows).toHaveLength(2)
    expect(valueOf(rows, 'state_of_residence')).toMatchObject({ proposed_value: 'CA', reliability: 'A', method: 'confirmed_address_fips' })
    expect(valueOf(rows, 'county_of_residence')).toMatchObject({ proposed_value: 'Los Angeles County', reliability: 'A' })
    for (const r of rows) {
      expect(r.source_refs).toEqual([{ kind: 'address', id: fx.caseId, label: 'USPS-verified address, county FIPS 06037' }])
      expect(JSON.stringify(r.source_refs)).not.toContain('1 Test St')
    }
    const second = await runFinancialsPropose(env, fx.caseId)
    expect(second.address).toMatchObject({ kept: 2, inserted: 0 })
  })

  it('runs through the queue: ack once, never retry', async () => {
    const fx = await seedConfirmed('06037', 'Los Angeles')
    const ack = vi.fn()
    const retry = vi.fn()
    const body: Job = { type: 'financials_propose', ref: fx.caseId, reason: 'refresh' }
    await queue({ queue: 'resspark-jobs', messages: [{ body, ack, retry, attempts: 1 }] } as unknown as MessageBatch<Job>, env)
    expect(ack).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalled()
    expect(await open(fx.caseId, 'address')).toHaveLength(2)
  })

  it('Logics case 900001 proposes married, age and liability; the DOB text is stored nowhere', async () => {
    // (firm, logics_case_id) is unique and other live suites keep a test-firm 900001 case: reuse it,
    // removing only the proposals of this case before and after.
    const existing = (await db.from('cases').select('id').eq('firm_id', TEST_FIRM).eq('logics_case_id', 900001).maybeSingle()).data
    const fx = existing
      ? { caseId: existing.id as string, cleanup: async () => void (await db.from('financial_proposals').delete().eq('case_id', existing.id)) }
      : await seedFinancialCase(env, { logicsCaseId: 900001 })
    fixtures.push(fx as FinancialFixture)
    await fx.cleanup()
    const result = await runFinancialsPropose(env, fx.caseId, NOW)
    expect(result).toMatchObject({ address: 'skipped', logics: { inserted: 3 } })
    const rows = await open(fx.caseId, 'logics')
    expect(valueOf(rows, 'filing_status_married')).toMatchObject({ proposed_value: true, reliability: 'A' })
    expect(valueOf(rows, 'age_taxpayer')).toMatchObject({ proposed_value: 46, reliability: 'A' })
    expect(valueOf(rows, 'total_tax_owed')).toMatchObject({ proposed_value: 18450, reliability: 'B' })
    const events = (await db.from('events').select('action, payload').eq('case_id', fx.caseId)).data ?? []
    expect(events.length).toBeGreaterThan(0)
    for (const text of [JSON.stringify(events), JSON.stringify(rows)]) {
      expect(text).not.toContain('07/24/1980')
      expect(text).not.toContain('18,450')
    }
  })

  it('old Connecticut FIPS 09003 proposes the state only; the county block is ct_old_county', async () => {
    const fx = await seedConfirmed('09003', 'Hartford', 'CT')
    await runFinancialsPropose(env, fx.caseId, NOW)
    const rows = await open(fx.caseId, 'address')
    expect(rows.map((r) => r.canonical_column)).toEqual(['state_of_residence'])
    const caseRow = (await db.from('cases').select('*').eq('id', fx.caseId).single()).data!
    expect(countyBlock(caseRow, await lookupCountyFips(env, '09003'), null).status).toBe('ct_old_county')
  })

  it('FIPS 99999 is not in the IRS table: Smarty county name with reliability C', async () => {
    const fx = await seedConfirmed('99999', 'Nowhere')
    await runFinancialsPropose(env, fx.caseId, NOW)
    const rows = await open(fx.caseId, 'address')
    expect(valueOf(rows, 'county_of_residence')).toMatchObject({
      proposed_value: 'Nowhere',
      reliability: 'C',
      method: 'smarty_county_name_not_in_irs_table',
    })
  })
})
