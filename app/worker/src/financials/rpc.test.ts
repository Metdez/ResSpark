import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('../db/client', () => ({ createAdminClient: () => ({ rpc }) }))

import { decideValue, FinancialRpcError, fetchStandardsBundle, upsertProposals } from './rpc'

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'k' }
const decide = () =>
  decideValue(env, { firmId: 'f', caseId: 'c', column: 'household_size', action: 'accept', proposalId: 'p', actorId: 'a' })

describe('financials rpc wrappers', () => {
  beforeEach(() => rpc.mockReset())

  it('passes p_* parameters and returns data', async () => {
    rpc.mockResolvedValue({ data: { inserted: 1, kept: 0, superseded: 0 }, error: null })
    const out = await upsertProposals(env, {
      firmId: 'f', caseId: 'c', source: 'intake', generatorVersion: 'v1', proposals: [],
    })
    expect(out).toEqual({ inserted: 1, kept: 0, superseded: 0 })
    expect(rpc).toHaveBeenCalledWith('financial_proposals_upsert', expect.objectContaining({
      p_firm_id: 'f', p_case_id: 'c', p_source: 'intake', p_scope_columns: null, p_actor_type: 'system',
    }))
  })

  it('maps a RAISE token to FinancialRpcError', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'proposal_stale', code: 'P0001' } })
    await expect(decide()).rejects.toMatchObject({ code: 'proposal_stale' })
  })

  it('maps a CHECK violation (23514) to bad_value', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'violates check constraint', code: '23514' } })
    await expect(decide()).rejects.toBeInstanceOf(FinancialRpcError)
    await expect(decide()).rejects.toMatchObject({ code: 'bad_value' })
  })

  it('hides any other database message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'secret value 1234 broke', code: 'XX000' } })
    await expect(
      fetchStandardsBundle(env, { state: 'CA', county: 'Los Angeles County', householdSize: 1, vehicleCount: 0 })
    ).rejects.toThrow(/^financials_rpc_failed$/)
  })
})
