import { createAdminClient } from '../db/client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export type ProposalSource = 'truv' | 'plaid' | 'intake' | 'logics' | 'address' | 'document'
export type Reliability = 'A' | 'B' | 'C'
export interface SourceRef {
  kind:
    | 'bank_transaction'
    | 'bank_account'
    | 'pay_stub'
    | 'w2'
    | 'income_report'
    | 'intake_answer'
    | 'logics_field'
    | 'address'
    | 'document'
  id: string
  label: string
}
export interface ProposalInput {
  canonical_column: string
  proposed_value: boolean | number | string | number[]
  source_refs: SourceRef[]
  method: string
  window_start: string | null
  window_end: string | null
  reliability: Reliability
}
export type DecideAction = 'accept' | 'edit' | 'known_zero' | 'unknown' | 'reject' | 'not_applicable'

const TOKENS = [
  'case_not_found',
  'bad_action',
  'bad_column',
  'bad_value',
  'note_required',
  'proposal_stale',
  'bad_source',
] as const
export type FinancialRpcCode = (typeof TOKENS)[number]

export class FinancialRpcError extends Error {
  constructor(public code: FinancialRpcCode) {
    super(code)
  }
}

// Never surfaces the database message: it can quote a value.
function toError(error: { message?: string; code?: string }): Error {
  if (error.code === '23514') return new FinancialRpcError('bad_value')
  const words = (error.message ?? '').split(/\W+/)
  const token = TOKENS.find((t) => words.includes(t))
  return token ? new FinancialRpcError(token) : new Error('financials_rpc_failed')
}

export async function upsertProposals(
  env: DbEnv,
  p: {
    firmId: string
    caseId: string
    source: ProposalSource
    generatorVersion: string
    proposals: ProposalInput[]
    scopeColumns?: string[] | null
    actor?: { type: 'system' | 'client' | 'staff'; id?: string }
  }
): Promise<{ inserted: number; kept: number; superseded: number }> {
  const { data, error } = await createAdminClient(env).rpc('financial_proposals_upsert', {
    p_firm_id: p.firmId,
    p_case_id: p.caseId,
    p_source: p.source,
    p_generator_version: p.generatorVersion,
    p_proposals: p.proposals,
    p_scope_columns: p.scopeColumns ?? null,
    p_actor_type: p.actor?.type ?? 'system',
    p_actor_id: p.actor?.id ?? null,
  })
  if (error) throw toError(error)
  return data
}

export async function decideValue(
  env: DbEnv,
  p: {
    firmId: string
    caseId: string
    column: string
    action: DecideAction
    value?: unknown
    proposalId?: string | null
    note?: string | null
    actorId: string
  }
): Promise<{ column: string; action: DecideAction; proposal_id: string | null }> {
  const { data, error } = await createAdminClient(env).rpc('financial_value_decide', {
    p_firm_id: p.firmId,
    p_case_id: p.caseId,
    p_column: p.column,
    p_action: p.action,
    p_value: p.value ?? null,
    p_proposal_id: p.proposalId ?? null,
    p_note: p.note ?? null,
    p_actor_id: p.actorId,
  })
  if (error) throw toError(error)
  return data
}

// Raw JSON; Plan 04 validates the shape.
export async function fetchStandardsBundle(
  env: DbEnv,
  p: { state: string; county: string; householdSize: number; vehicleCount: number }
): Promise<unknown> {
  const { data, error } = await createAdminClient(env).rpc('standards_bundle', {
    p_state: p.state,
    p_county: p.county,
    p_household_size: p.householdSize,
    p_vehicle_count: p.vehicleCount,
  })
  if (error) throw toError(error)
  return data
}
