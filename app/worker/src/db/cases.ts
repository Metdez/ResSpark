import type { LogicsCaseSummary } from '../integrations/logics/mapper'
import { createAdminClient } from './client'
import { rpcErrorToken } from './rpc-error'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export interface CaseRow {
  id: string
  firm_id: string
  logics_case_id: number | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone_e164: string | null
  logics_snapshot: unknown
  logics_fetched_at: string | null
}

// Idempotent upsert on (firm_id, logics_case_id) plus the case.looked_up event, in one transaction (0003).
export async function confirmLogicsCase(
  env: DbEnv,
  input: { firm_id: string; summary: LogicsCaseSummary; phone_e164: string | null; actor_id: string; search_type: string }
): Promise<string> {
  const { summary } = input
  const { data, error } = await createAdminClient(env).rpc('case_confirm_logics', {
    p_firm_id: input.firm_id,
    p_logics_case_id: summary.logics_case_id,
    p_first_name: summary.first_name,
    p_last_name: summary.last_name,
    p_email: summary.email,
    p_phone_e164: input.phone_e164,
    p_snapshot: summary,
    p_actor_id: input.actor_id,
    p_search_type: input.search_type,
  })
  if (error) throw new Error(rpcErrorToken(error) ?? 'case_confirm_failed')
  return data as string
}

export async function getCase(env: DbEnv, firmId: string, caseId: string): Promise<CaseRow | null> {
  const { data, error } = await createAdminClient(env)
    .from('cases')
    .select('id, firm_id, logics_case_id, first_name, last_name, email, phone_e164, logics_snapshot, logics_fetched_at')
    .eq('firm_id', firmId)
    .eq('id', caseId)
    .maybeSingle()
  if (error) throw new Error('case_lookup_failed')
  return data as CaseRow | null
}
