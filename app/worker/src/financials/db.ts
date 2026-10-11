// Firm-scoped reads and the one insert behind the 433-A routes. Database messages never leave here.
import { createAdminClient } from '../db/client'
import { LINES } from './lines'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export interface FinancialsCase {
  id: string
  logics_case_id: number | null
  first_name: string | null
  last_name: string | null
  financials_settings: Record<string, unknown>
}

export interface ProposalRow {
  id: string
  canonical_column: string
  proposed_value: unknown
  source: string
  source_refs: Array<{ kind: string; id: string; label: string }>
  method: string
  window_start: string | null
  window_end: string | null
  reliability: 'A' | 'B' | 'C'
  status: 'proposed' | 'accepted' | 'edited' | 'rejected' | 'superseded'
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

const MONEY = LINES.filter((x) => x.kind === 'money' && x.column).map((x) => x.column as string)

// Defensive: PostgREST renders numeric as a JSON number today; a string would break the engine math.
function coerce(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row }
  for (const key of MONEY) if (typeof out[key] === 'string') out[key] = Number(out[key])
  return out
}

export async function getCaseForFinancials(
  env: DbEnv,
  firmId: string,
  caseId: string
): Promise<{ caseRow: FinancialsCase; row: Record<string, unknown> | null } | null> {
  const db = createAdminClient(env)
  const { data: caseRow, error } = await db
    .from('cases')
    .select('id, logics_case_id, first_name, last_name, financials_settings')
    .eq('firm_id', firmId)
    .eq('id', caseId)
    .maybeSingle()
  if (error) throw new Error('case_lookup_failed')
  if (!caseRow) return null
  const { data: row, error: rowError } = await db.from('case_financial_data').select('*').eq('case_id', caseId).maybeSingle()
  if (rowError) throw new Error('financials_lookup_failed')
  return { caseRow: caseRow as FinancialsCase, row: row ? coerce(row) : null }
}

export async function listProposals(env: DbEnv, firmId: string, caseId: string): Promise<ProposalRow[]> {
  const { data, error } = await createAdminClient(env)
    .from('financial_proposals')
    .select('id, canonical_column, proposed_value, source, source_refs, method, window_start, window_end, reliability, status, decided_by, decided_at, created_at')
    .eq('firm_id', firmId)
    .eq('case_id', caseId)
    .neq('status', 'superseded')
    .order('created_at', { ascending: false })
  if (error) throw new Error('proposals_lookup_failed')
  return data as ProposalRow[]
}

export async function getStandardsVersion(env: DbEnv): Promise<{ effective_date: string; source_url: string } | null> {
  const { data, error } = await createAdminClient(env)
    .from('standards_versions')
    .select('effective_date, source_url')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new Error('standards_version_lookup_failed')
  return data
}

export async function staffDisplayNames(env: DbEnv, firmId: string, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const { data, error } = await createAdminClient(env)
    .from('staff_profiles')
    .select('user_id, display_name')
    .eq('firm_id', firmId)
    .in('user_id', ids)
  if (error) throw new Error('staff_lookup_failed')
  return Object.fromEntries((data ?? []).map((s) => [s.user_id as string, s.display_name as string]))
}

// D-15: runs are insert-only; nothing in the Worker updates or deletes them.
export async function insertDeterminationRun(env: DbEnv, run: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await createAdminClient(env).from('determination_runs').insert(run).select('*').single()
  if (error || !data) throw new Error('run_insert_failed')
  return data
}

export async function getLatestRun(env: DbEnv, firmId: string, caseId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await createAdminClient(env)
    .from('determination_runs')
    .select('*')
    .eq('firm_id', firmId)
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('run_lookup_failed')
  return data
}
