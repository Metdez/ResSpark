// The financials_propose job (D-07): recompute every source's proposals for one case, idempotently.
import { createAdminClient } from '../../db/client'
import { logEvent } from '../../db/events'
import { ProviderError, NonRetryableError } from '../../integrations/provider-error'
import { LogicsError, type LogicsCaseInfoRow } from '../../integrations/logics/client'
import { ADDRESS_COLUMNS } from '../county'
import { type ProposalInput, type ProposalSource, upsertProposals } from '../rpc'
import { settingsOf } from '../view'
import { proposeAddress } from './address'
import { completeMonthsWindow } from './window'

export const GENERATOR_VERSION = 'p7-1'

export interface ProposeContext {
  env: Env
  firmId: string
  caseId: string
  caseRow: Record<string, unknown>
  settings: { window_months: 3 | 6; spouse_employer_ids: string[] }
  window: { start: string; end: string; months: 3 | 6 }
  now: Date
  // Memoized; null when the case has no Logics id or Logics is not configured.
  logicsCaseInfo(): Promise<LogicsCaseInfoRow | null>
}

// null = could not run (old rows kept); [] = ran and found nothing (old rows of the source superseded).
export type Proposer = (ctx: ProposeContext) => Promise<{ source: ProposalSource; proposals: ProposalInput[] } | null>

// Keyed by a name for results and logs; order is run order. Plan 07 adds bank and payroll.
export const PROPOSERS: Record<string, Proposer> = { address: proposeAddress }

type SourceResult = { inserted: number; kept: number; superseded: number } | 'skipped' | 'failed'

// Vendor outages retry the job (queue backoff); everything else is permanent for that source.
export const isTransient = (e: unknown) =>
  (e instanceof ProviderError && e.transient) || (e instanceof LogicsError && (e.kind === 'network' || e.kind === 'upstream'))

// Our own tokens only, never vendor or Postgres text.
const codeOf = (e: unknown) => {
  if (e instanceof ProviderError || e instanceof NonRetryableError) return e.code
  if (e instanceof LogicsError) return `logics_${e.kind}`
  return e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : 'internal'
}

async function readCaseInfo(_env: Env, _firmId: string, logicsCaseId: number | null): Promise<LogicsCaseInfoRow | null> {
  if (logicsCaseId === null) return null
  return null // Task 2 reads Logics CaseInfo.
}

export async function runFinancialsPropose(env: Env, caseId: string, now: Date = new Date()): Promise<Record<string, SourceResult>> {
  const { data: row, error } = await createAdminClient(env)
    .from('cases')
    .select(`id, firm_id, logics_case_id, financials_settings, ${ADDRESS_COLUMNS}`)
    .eq('id', caseId)
    .maybeSingle()
  if (error) throw new Error('case_lookup_failed')
  if (!row) throw new NonRetryableError('case_missing')
  const caseRow = row as Record<string, unknown>
  const firmId = caseRow.firm_id as string
  const settings = settingsOf(caseRow.financials_settings as Record<string, unknown> | null)
  let caseInfo: Promise<LogicsCaseInfoRow | null> | undefined
  const ctx: ProposeContext = {
    env,
    firmId,
    caseId,
    caseRow,
    settings,
    window: completeMonthsWindow(now, settings.window_months),
    now,
    logicsCaseInfo: () => (caseInfo ??= readCaseInfo(env, firmId, (caseRow.logics_case_id as number | null) ?? null)),
  }

  const results: Record<string, SourceResult> = {}
  let transient: unknown = null
  for (const [name, propose] of Object.entries(PROPOSERS)) {
    try {
      const out = await propose(ctx)
      results[name] = out
        ? await upsertProposals(env, { firmId, caseId, source: out.source, generatorVersion: GENERATOR_VERSION, proposals: out.proposals, scopeColumns: null })
        : 'skipped'
    } catch (e) {
      results[name] = 'failed'
      // The other sources still run; the whole idempotent job is retried after the loop.
      if (isTransient(e)) {
        transient ??= e
        continue
      }
      await logEvent(env, { firm_id: firmId, case_id: caseId, actor_type: 'system', action: 'financials.propose_failed', payload: { source: name, code: codeOf(e) } })
    }
  }
  if (transient) throw transient
  return results
}
