import { CLIENT_QUESTION_IDS, PREFILL_COLUMNS, validateClientAnswer } from '../../../shared/questions'
import { createAdminClient } from './client'
import { sessionRequest } from './documents'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>
export type AnswerValue = boolean | number | string
export interface IntakeContext {
  caseId: string
  item: { id: string; status: string }
}

// The case and item come only from the cookie session's request (T-07-34).
export async function intakeContext(
  env: DbEnv,
  client: { requestId: string; firmId: string }
): Promise<IntakeContext | null> {
  const req = await sessionRequest(env, client.requestId, client.firmId)
  if (!req) return null
  const { data, error } = await createAdminClient(env)
    .from('request_items')
    .select('id, status')
    .eq('request_id', client.requestId)
    .eq('kind', 'intake')
    .order('position')
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('item_lookup_failed')
  return data ? { caseId: req.case_id, item: data } : null
}

// Latest non-superseded intake answer per client question (staff decisions keep the client's value).
export async function listAnswers(env: DbEnv, firmId: string, caseId: string): Promise<Record<string, AnswerValue>> {
  const { data, error } = await createAdminClient(env)
    .from('financial_proposals')
    .select('canonical_column, proposed_value')
    .eq('firm_id', firmId)
    .eq('case_id', caseId)
    .eq('source', 'intake')
    .neq('status', 'superseded')
    .in('canonical_column', CLIENT_QUESTION_IDS as string[])
    .order('created_at', { ascending: false })
  if (error) throw new Error('answers_lookup_failed')
  const out: Record<string, AnswerValue> = {}
  for (const r of data as { canonical_column: string; proposed_value: AnswerValue }[])
    if (!(r.canonical_column in out)) out[r.canonical_column] = r.proposed_value
  return out
}

// D-13 / T-07-37: four columns, A-reliability Truv or Logics only, never for an answered question.
export async function listPrefill(
  env: DbEnv,
  firmId: string,
  caseId: string,
  answered: Readonly<Record<string, unknown>>
): Promise<Record<string, { value: AnswerValue; source: 'truv' | 'logics' }>> {
  const { data, error } = await createAdminClient(env)
    .from('financial_proposals')
    .select('canonical_column, proposed_value, source')
    .eq('firm_id', firmId)
    .eq('case_id', caseId)
    .in('source', ['truv', 'logics'])
    .eq('reliability', 'A')
    .in('status', ['proposed', 'accepted'])
    .in('canonical_column', PREFILL_COLUMNS as string[])
    .order('created_at', { ascending: false })
  if (error) throw new Error('prefill_lookup_failed')
  const out: Record<string, { value: AnswerValue; source: 'truv' | 'logics' }> = {}
  for (const r of data as { canonical_column: string; proposed_value: AnswerValue; source: 'truv' | 'logics' }[]) {
    const col = r.canonical_column
    // A value the client could not pick (e.g. an unlisted pay frequency) is not offered.
    if (col in out || col in answered || validateClientAnswer(col, r.proposed_value)) continue
    out[col] = { value: r.proposed_value, source: r.source }
  }
  return out
}

export async function markItemInProgress(env: DbEnv, itemId: string): Promise<void> {
  const { error } = await createAdminClient(env)
    .from('request_items')
    .update({ status: 'in_progress' })
    .eq('id', itemId)
    .eq('status', 'pending')
  if (error) throw new Error('item_update_failed')
}

export async function submitIntake(
  env: DbEnv,
  p: { itemId: string; requestId: string; linkId: string }
): Promise<{ item_status: string; request_status: string }> {
  const { data, error } = await createAdminClient(env).rpc('intake_submit', {
    p_item_id: p.itemId,
    p_request_id: p.requestId,
    p_link_id: p.linkId,
  })
  if (error) throw new Error((error.message ?? '').includes('item_not_found') ? 'item_not_found' : 'intake_submit_failed')
  const r = data as { item_status: string; request_status: string }
  return { item_status: r.item_status, request_status: r.request_status }
}
