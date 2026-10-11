import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { runFinancialsPropose } from '../src/financials/propose/run'
import { queue, type Job } from '../src/jobs/index'
import { seedFinancialCase, type FinancialFixture } from './fixtures/financials'

// FORM-03 / ADDR-02 against the live project: case address -> financials_propose -> proposals.
// Run with `pnpm -C app run test:live:file worker/test/financials-propose.test.ts`.
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
if (!live) process.stderr.write('financials propose suite skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY\n')

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose row JSON in assertions only
type Json = Record<string, any>

describe.skipIf(!live)('financials_propose (live)', () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY } as unknown as Env
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
})
