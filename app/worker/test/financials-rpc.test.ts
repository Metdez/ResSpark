import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { decideValue, FinancialRpcError, upsertProposals, type ProposalInput } from '../src/financials/rpc'
import { seedFinancialCase, type FinancialFixture } from './fixtures/financials'

// D-05/D-06/D-07 against the live project: proposals in, staff decisions out, one column per decision.
// Run with `pnpm -C app run test:live:file worker/test/financials-rpc.test.ts`.
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
if (!live) process.stderr.write('financials rpc suite skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY\n')

const ACTOR = '00000000-0000-0000-0000-0000000000a7'
const OTHER_FIRM = '00000000-0000-0000-0000-00000000000f'
const ALLOWED_KEYS = ['column', 'proposal_id', 'source', 'derived_from']

const proposal = (column: string, value: ProposalInput['proposed_value'], method = 'client_answer'): ProposalInput => ({
  canonical_column: column,
  proposed_value: value,
  method,
  reliability: 'C',
  source_refs: [],
  window_start: null,
  window_end: null,
})

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p
    return 'resolved'
  } catch (e) {
    return e instanceof FinancialRpcError ? e.code : (e as Error).message
  }
}

describe.skipIf(!live)('financial proposals and decisions (live)', () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY } as unknown as Env
  let db: SupabaseClient
  const fixtures: FinancialFixture[] = []
  const seed = async () => {
    const fx = await seedFinancialCase(env)
    fixtures.push(fx)
    return fx
  }
  const row = async (caseId: string) =>
    (await db.from('case_financial_data').select('*').eq('case_id', caseId).single()).data as Record<string, unknown>
  const proposals = async (caseId: string, column: string) =>
    ((await db.from('financial_proposals').select('*').eq('case_id', caseId).eq('canonical_column', column).order('created_at'))
      .data ?? []) as Array<Record<string, unknown>>
  const events = async (caseId: string, action: string) =>
    ((await db.from('events').select('payload').eq('case_id', caseId).eq('action', action).order('id')).data ?? []) as Array<{
      payload: Record<string, unknown>
    }>
  const upsert = (fx: FinancialFixture, items: ProposalInput[], extra: Partial<Parameters<typeof upsertProposals>[1]> = {}) =>
    upsertProposals(env, { firmId: fx.firmId, caseId: fx.caseId, source: 'intake', generatorVersion: 'test-1', proposals: items, ...extra })
  const decide = (fx: FinancialFixture, p: Omit<Parameters<typeof decideValue>[1], 'firmId' | 'caseId' | 'actorId'>) =>
    decideValue(env, { firmId: fx.firmId, caseId: fx.caseId, actorId: ACTOR, ...p })
  const proposedId = async (fx: FinancialFixture, column: string) =>
    (await proposals(fx.caseId, column)).find((r) => r.status === 'proposed')!.id as string

  beforeAll(() => {
    db = createAdminClient(env)
  })
  afterAll(async () => {
    for (const fx of fixtures) await fx.cleanup()
  })

  it('tracer: upsert → accept writes exactly one column and a value-free event', async () => {
    const fx = await seed()
    expect(await upsert(fx, [proposal('household_size', 3)])).toEqual({ inserted: 1, kept: 0, superseded: 0 })
    const id = await proposedId(fx, 'household_size')
    expect(await decide(fx, { column: 'household_size', action: 'accept', proposalId: id })).toEqual({
      column: 'household_size',
      action: 'accept',
      proposal_id: id,
    })
    const r = await row(fx.caseId)
    expect(r.household_size).toBe(3)
    for (const [k, v] of Object.entries(r)) {
      if (!['case_id', 'updated_at', 'household_size'].includes(k)) expect(v, k).toBeNull()
    }
    const [p] = await proposals(fx.caseId, 'household_size')
    expect(p).toMatchObject({ status: 'accepted', decided_by: ACTOR, decided_value: 3 })
    const ev = await events(fx.caseId, 'financial.value_accept')
    expect(ev).toHaveLength(1)
    expect(Object.keys(ev[0].payload).every((k) => ['column', 'proposal_id', 'source'].includes(k))).toBe(true)
    expect(Object.values(ev[0].payload)).not.toContain(3)
    expect(Object.values(ev[0].payload)).not.toContain('3')
  })

  it('decide: edit, known_zero, unknown, reject and their guards', async () => {
    const fx = await seed()
    expect(await codeOf(decide(fx, { column: 'actual_housing_utilities', action: 'edit', value: 2400.5 }))).toBe('note_required')
    await upsertProposals(env, {
      firmId: fx.firmId, caseId: fx.caseId, source: 'plaid', generatorVersion: 'test-1',
      proposals: [proposal('actual_housing_utilities', 2300, 'bank_average')],
    })
    const pid = await proposedId(fx, 'actual_housing_utilities')
    await decide(fx, { column: 'actual_housing_utilities', action: 'edit', value: 2400.5, proposalId: pid, note: 'lease says 2400.50' })
    expect((await row(fx.caseId)).actual_housing_utilities).toBe(2400.5)
    expect((await proposals(fx.caseId, 'actual_housing_utilities'))[0]).toMatchObject({ status: 'edited', decided_value: 2400.5 })
    expect(await codeOf(decide(fx, { column: 'actual_housing_utilities', action: 'accept', proposalId: pid }))).toBe('proposal_stale')

    await decide(fx, { column: 'gross_wages_spouse', action: 'edit', value: 1200, note: 'spouse letter' })
    expect((await proposals(fx.caseId, 'gross_wages_spouse'))[0]).toMatchObject({ source: 'staff', status: 'edited' })

    await decide(fx, { column: 'alimony_received', action: 'known_zero' })
    expect((await row(fx.caseId)).alimony_received).toBe(0)
    expect((await proposals(fx.caseId, 'alimony_received'))[0]).toMatchObject({ source: 'staff', status: 'accepted' })
    expect(await codeOf(decide(fx, { column: 'owns_home', action: 'known_zero' }))).toBe('bad_value')

    await decide(fx, { column: 'alimony_received', action: 'unknown' })
    expect((await row(fx.caseId)).alimony_received).toBeNull()

    await upsert(fx, [proposal('dependents_count', 2)])
    const rid = await proposedId(fx, 'dependents_count')
    await decide(fx, { column: 'dependents_count', action: 'reject', proposalId: rid })
    expect((await proposals(fx.caseId, 'dependents_count'))[0].status).toBe('rejected')
    expect((await row(fx.caseId)).dependents_count).toBeNull()
  })

  it('decide: not_applicable writes the type default and needs a note', async () => {
    const fx = await seed()
    const na = (column: string) => decide(fx, { column, action: 'not_applicable', note: 'single filer' })
    await na('age_spouse')
    await na('filing_joint_offer')
    await na('pay_frequency')
    const r = await row(fx.caseId)
    expect([r.age_spouse, r.filing_joint_offer, r.pay_frequency]).toEqual([0, false, 'not_applicable'])
    expect(await codeOf(decide(fx, { column: 'age_spouse', action: 'not_applicable' }))).toBe('note_required')
  })

  it('decide: column, value, firm and stale guards', async () => {
    const fx = await seed()
    const edit = (column: string, value: unknown) => decide(fx, { column, action: 'edit', value, note: 'n' })
    expect(await codeOf(edit('case_id', 1))).toBe('bad_column')
    expect(await codeOf(edit('nope', 1))).toBe('bad_column')
    expect(await codeOf(edit('actual_housing_utilities', 1.005))).toBe('bad_value')
    expect(await codeOf(edit('household_size', 2.5))).toBe('bad_value')
    expect(await codeOf(edit('household_size', 0))).toBe('bad_value')
    expect(
      await codeOf(decideValue(env, { firmId: OTHER_FIRM, caseId: fx.caseId, column: 'household_size', action: 'known_zero', actorId: ACTOR }))
    ).toBe('case_not_found')

    await upsert(fx, [proposal('household_size', 2)])
    const old = await proposedId(fx, 'household_size')
    await upsert(fx, [proposal('household_size', 4)])
    expect(await codeOf(decide(fx, { column: 'household_size', action: 'accept', proposalId: old }))).toBe('proposal_stale')
  })

  it('decide: a per-vehicle list also writes the legacy total', async () => {
    const fx = await seed()
    await decide(fx, { column: 'vehicle_market_values', action: 'edit', value: [10000, 5000.5], note: 'KBB' })
    const r = await row(fx.caseId)
    expect(r.vehicle_market_values).toEqual([10000, 5000.5])
    expect(r.vehicle_market_value_total).toBe(15000.5)
    const [ev] = await events(fx.caseId, 'financial.value_edit')
    expect(ev.payload.derived_from).toBe('per_vehicle_list')
    expect(Object.keys(ev.payload).every((k) => ALLOWED_KEYS.includes(k))).toBe(true)
  })

  it('upsert: keep, supersede, scope, no re-propose after accept', async () => {
    const fx = await seed()
    expect(await upsert(fx, [proposal('household_size', 3)])).toEqual({ inserted: 1, kept: 0, superseded: 0 })
    expect(await upsert(fx, [proposal('household_size', 3)])).toEqual({ inserted: 0, kept: 1, superseded: 0 })
    expect(await upsert(fx, [proposal('household_size', 4)])).toEqual({ inserted: 1, kept: 0, superseded: 1 })

    await upsert(fx, [proposal('household_size', 4), proposal('dependents_count', 1)])
    expect(await upsert(fx, [proposal('household_size', 4)])).toEqual({ inserted: 0, kept: 1, superseded: 1 })

    await upsert(fx, [proposal('household_size', 4), proposal('dependents_count', 1)])
    expect(await upsert(fx, [], { scopeColumns: ['dependents_count'] })).toEqual({ inserted: 0, kept: 0, superseded: 1 })
    expect((await proposals(fx.caseId, 'household_size')).filter((r) => r.status === 'proposed')).toHaveLength(1)

    await decide(fx, { column: 'household_size', action: 'accept', proposalId: await proposedId(fx, 'household_size') })
    expect(await upsert(fx, [proposal('household_size', 4)])).toEqual({ inserted: 0, kept: 1, superseded: 0 })
    expect((await proposals(fx.caseId, 'household_size')).filter((r) => r.status === 'proposed')).toHaveLength(0)
  })

  it('upsert: rejects null values and the staff source; concurrent runs both resolve', async () => {
    const fx = await seed()
    const nullValue = { ...proposal('household_size', 1), proposed_value: null } as unknown as ProposalInput
    expect(await codeOf(upsert(fx, [nullValue]))).toBe('bad_value')
    expect(await codeOf(upsert(fx, [proposal('household_size', 1)], { source: 'staff' as never }))).toBe('bad_source')
    const results = await Promise.all([
      upsert(fx, [proposal('household_size', 2)]),
      upsert(fx, [proposal('household_size', 5)]),
    ])
    expect(results).toHaveLength(2)
    expect((await proposals(fx.caseId, 'household_size')).filter((r) => r.status === 'proposed')).toHaveLength(1)
    // Both runs replaced or kept; neither raised 23505, and superseded rows are kept as history.
    expect((await proposals(fx.caseId, 'household_size')).some((r) => r.status === 'superseded')).toBe(true)
  })
})
