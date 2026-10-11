// D-15: run the engine against the county's standards and record one immutable run.
// Every amount comes from app/worker/src/engine; this module only orchestrates and persists.
import { isApplicable } from '../../../shared/questions'
import { logEvent } from '../db/events'
import { calculateAllowableExpenses, NRE_LINE_KEYS, NRE_LINE_LABELS, netRealizableEquityLines } from '../engine/determination'
import { financialDataFromCaseRow } from '../engine/financial-data'
import { evaluateCase, missingFinancialColumns, missingQuestionIds } from '../engine/intake-workflow'
import { ENGINE_VERSION, NEXT_STEP, outcomeFor } from '../engine/outcome'
import { pyMax } from '../engine/py'
import { StandardsLookupError } from '../engine/standards'
import { BundleStandardsRepository, isStandardsBundle, type StandardsBundle } from '../standards/bundle-repository'
import { getCaseForFinancials, getStandardsVersion, insertDeterminationRun } from './db'
import { labelFor } from './lines'
import { fetchStandardsBundle } from './rpc'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export interface RunView {
  id: string
  created_at: string
  status: 'ready' | 'ready_for_review' | 'blocked'
  path: string
  reason: string
  outcome: { id: string; label: string } | null
  next: string
  monthly_income: number
  monthly_expenses: number
  net_disposable_income: number
  net_realizable_equity: number
  suggested_offer_or_payment: number
  needs_manual_review: boolean
  review_flags: string[]
  allowable_breakdown: Record<string, number>
  nre_lines: Array<{ key: string; label: string; value: number }>
  standards_inputs: StandardsBundle
  standards_effective_date: string | null
  engine_version: string
  payment_math: { total_tax_owed: number; csed_months_used: number } | null
  created_by_name: string | null
}

// Responses for missing facts or unavailable standards carry labels only, never amounts (T-07-17).
export type EvaluationResponse =
  | { run: RunView; outcome: { kind: 'determination' } }
  | {
      run: null
      outcome: { kind: 'information_needed'; missing: Array<{ column: string; label: string }>; review_flags: string[] }
    }
  | { run: null; outcome: { kind: 'standards_unavailable'; message: 'Standards unavailable' } }

const UNAVAILABLE = { run: null, outcome: { kind: 'standards_unavailable', message: 'Standards unavailable' } } as const
const PAYMENT_OUTCOMES = new Set(['simple_plan', 'non_simple_installment'])

export async function evaluateForCase(
  env: DbEnv,
  p: { firmId: string; caseId: string; actorId: string; actorName?: string | null }
): Promise<EvaluationResponse | null> {
  const found = await getCaseForFinancials(env, p.firmId, p.caseId)
  if (!found) return null
  const row = found.row ?? {}

  // Unknown required facts block; the engine reports them before any standards lookup.
  if (missingFinancialColumns(row).length > 0 || missingQuestionIds(row).some((id) => isApplicable(id, row))) {
    const w = evaluateCase(row, null)
    const missing = [...new Set([...w.missing_question_ids, ...w.missing_financial_fields])]
    return {
      run: null,
      outcome: { kind: 'information_needed', missing: missing.map((column) => ({ column, label: labelFor(column) })), review_flags: w.review_flags },
    }
  }

  const bundle = await fetchStandardsBundle(env, {
    state: row.state_of_residence as string,
    county: row.county_of_residence as string,
    householdSize: row.household_size as number,
    vehicleCount: row.vehicle_count as number,
  })
  if (!isStandardsBundle(bundle)) throw new Error('standards_bundle_invalid')
  const repo = new BundleStandardsRepository(bundle)
  let workflow: ReturnType<typeof evaluateCase>
  try {
    workflow = evaluateCase(row, repo)
  } catch (e) {
    if (e instanceof StandardsLookupError) return UNAVAILABLE
    throw e
  }
  const d = workflow.determination
  if (!d || workflow.status === 'information_needed') throw new Error('evaluation_without_determination')

  // Same repository: lookups already succeeded inside evaluateCase.
  const fd = financialDataFromCaseRow(row)
  const nre = netRealizableEquityLines(fd)
  const version = await getStandardsVersion(env)
  const saved = await insertDeterminationRun(env, {
    case_id: p.caseId,
    firm_id: p.firmId,
    created_by: p.actorId,
    status: workflow.status,
    path: d.path,
    reason: d.reason,
    monthly_income: d.monthly_income,
    monthly_expenses: d.monthly_expenses,
    net_disposable_income: d.net_disposable_income,
    net_realizable_equity: d.net_realizable_equity,
    suggested_offer_or_payment: d.suggested_offer_or_payment,
    needs_manual_review: d.needs_manual_review,
    review_notes: workflow.review_flags,
    financial_data_snapshot: row,
    allowable_breakdown: calculateAllowableExpenses(fd, repo),
    nre_lines: NRE_LINE_KEYS.map((key) => ({ key, label: NRE_LINE_LABELS[key], value: nre[key] })),
    standards_inputs: bundle,
    standards_effective_date: version?.effective_date ?? null,
    engine_version: ENGINE_VERSION,
  })
  const run = toRunView(saved, p.actorName ?? null)
  // D-20: ids, status and outcome id only.
  await logEvent(env, {
    firm_id: p.firmId,
    case_id: p.caseId,
    actor_type: 'staff',
    actor_id: p.actorId,
    action: 'evaluation.created',
    payload: { run_id: run.id, status: run.status, outcome_id: run.outcome?.id ?? null },
  })
  return { run, outcome: { kind: 'determination' } }
}

export function toRunView(row: Record<string, unknown>, createdByName: string | null): RunView {
  const snapshot = (row.financial_data_snapshot ?? {}) as Record<string, unknown>
  const path = row.path as string
  const outcome = outcomeFor(path)
  const breakdown = (row.allowable_breakdown ?? {}) as Record<string, unknown>
  return {
    id: row.id as string,
    created_at: row.created_at as string,
    status: row.status as RunView['status'],
    path,
    reason: row.reason as string,
    outcome,
    next: NEXT_STEP,
    monthly_income: Number(row.monthly_income),
    monthly_expenses: Number(row.monthly_expenses),
    net_disposable_income: Number(row.net_disposable_income),
    net_realizable_equity: Number(row.net_realizable_equity),
    suggested_offer_or_payment: Number(row.suggested_offer_or_payment),
    needs_manual_review: row.needs_manual_review === true,
    review_flags: Array.isArray(row.review_notes) ? (row.review_notes as string[]) : [],
    allowable_breakdown: Object.fromEntries(Object.entries(breakdown).map(([k, v]) => [k, Number(v)])),
    nre_lines: (row.nre_lines ?? []) as RunView['nre_lines'],
    standards_inputs: row.standards_inputs as StandardsBundle,
    standards_effective_date: (row.standards_effective_date as string | null) ?? null,
    engine_version: row.engine_version as string,
    payment_math:
      outcome && PAYMENT_OUTCOMES.has(outcome.id)
        ? {
            total_tax_owed: Number(snapshot.total_tax_owed),
            csed_months_used: pyMax(Number(snapshot.csed_months_remaining), 1),
          }
        : null,
    created_by_name: createdByName,
  }
}
