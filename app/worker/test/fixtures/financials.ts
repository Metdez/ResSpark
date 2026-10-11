import { createAdminClient } from '../../src/db/client'

export const TEST_FIRM = '00000000-0000-0000-0000-00000000000e'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (res.error || res.data === null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
  return res.data
}

export interface FinancialFixture {
  firmId: string
  caseId: string
  requestId: string | null
  itemIds: Record<string, string>
  cleanup(): Promise<void>
}

// A fresh case per call: case_financial_data has one row per case, so suites never share values.
// cleanup() removes everything it created except the case itself (events.case_id has no ON DELETE).
export async function seedFinancialCase(
  env: DbEnv,
  opts: {
    logicsCaseId?: number
    row?: Record<string, unknown>
    withRequest?: { items: Array<{ kind: string; label: string; status?: string }> }
  } = {}
): Promise<FinancialFixture> {
  const db = createAdminClient(env)
  must(
    await db
      .from('firms')
      .upsert({ id: TEST_FIRM, name: 'Test firm (automated)' }, { onConflict: 'id', ignoreDuplicates: true })
      .select('id'),
    'seed firm'
  )
  const caseId = crypto.randomUUID()
  must(
    await db
      .from('cases')
      .insert({ id: caseId, firm_id: TEST_FIRM, first_name: 'Financials', last_name: 'Probe', logics_case_id: opts.logicsCaseId ?? null })
      .select('id'),
    'seed case'
  )
  if (opts.row) {
    must(await db.from('case_financial_data').insert({ case_id: caseId, ...opts.row }).select('case_id'), 'seed row')
  }
  let requestId: string | null = null
  const itemIds: Record<string, string> = {}
  if (opts.withRequest) {
    const req = must(
      await db
        .from('requests')
        .insert({ firm_id: TEST_FIRM, case_id: caseId, template_name: 'test', status: 'opened', sent_at: new Date().toISOString(), opened_at: new Date().toISOString() })
        .select('id')
        .single(),
      'seed request'
    ) as { id: string }
    requestId = req.id
    const rows = opts.withRequest.items.map((it, i) => ({
      request_id: req.id,
      position: i + 1,
      kind: it.kind,
      label: it.label,
      required: true,
      status: it.status ?? 'pending',
    }))
    const items = must(await db.from('request_items').insert(rows).select('id, label'), 'seed items') as { id: string; label: string }[]
    for (const it of items) itemIds[it.label] = it.id
  }
  return {
    firmId: TEST_FIRM,
    caseId,
    requestId,
    itemIds,
    async cleanup() {
      must(await db.from('financial_proposals').delete().eq('case_id', caseId).select('id'), 'delete proposals')
      must(await db.from('case_financial_data').delete().eq('case_id', caseId).select('case_id'), 'delete row')
      must(await db.from('determination_runs').delete().eq('case_id', caseId).select('id'), 'delete runs')
      must(await db.from('documents').delete().eq('case_id', caseId).select('id'), 'delete documents')
      if (requestId) {
        must(await db.from('request_items').delete().eq('request_id', requestId).select('id'), 'delete items')
        // Requests with events stay (events.request_id has no ON DELETE); the delete is best effort.
        await db.from('requests').delete().eq('id', requestId)
      }
    },
  }
}
