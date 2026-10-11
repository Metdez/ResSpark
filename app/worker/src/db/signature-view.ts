import { isEsignTemplateKey } from '../../../src/lib/esign-templates'
import { docusealConfigured } from '../integrations/esign/docuseal'
import { createAdminClient } from './client'
import { getEsignMapping } from './esign-settings'

export type EsignStage = 'not_started' | 'waiting' | 'viewed' | 'signing' | 'signed' | 'declined' | 'expired' | 'error'
type LastAction = 'esign.viewed' | 'esign.started'

export interface SignatureView {
  item_id: string
  template_key: string | null
  configured: boolean
  connection: {
    id: string
    status: string
    stage: EsignStage
    env: 'test' | 'production'
    error_code: string | null
    completed_at: string | null
  } | null
}

// D-20 stage: the connection status decides, and an open submission is refined by its last esign event.
export function esignStage(status: string | null, lastAction: LastAction | null, errorCode: string | null): EsignStage {
  if (status === null) return 'not_started'
  if (status === 'done') return 'signed'
  if (status === 'error') return errorCode === 'declined' ? 'declined' : errorCode === 'expired' ? 'expired' : 'error'
  if (lastAction === 'esign.started') return 'signing'
  if (lastAction === 'esign.viewed') return 'viewed'
  return 'waiting'
}

interface ConnRow {
  id: string
  request_item_id: string
  status: string
  env: string | null
  error_code: string | null
  completed_at: string | null
}

// D-12 / D-17: explicit columns only. link_ref (the signing slug) and external_id (the vendor
// submission id) are never selected, so they cannot reach staff.
export async function listRequestSignatures(env: Env, firmId: string, requestId: string): Promise<SignatureView[]> {
  const db = createAdminClient(env)
  const items = await db.from('request_items').select('id, config').eq('request_id', requestId).eq('kind', 'signature').order('position')
  if (items.error) throw new Error('item_list_failed')
  if (!items.data.length) return []

  const conns = await db
    .from('connections')
    .select('id, request_item_id, status, env:data->>env, error_code:error->>code, completed_at')
    .eq('firm_id', firmId)
    .eq('request_id', requestId)
    .eq('provider', 'docuseal')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (conns.error) throw new Error('connection_list_failed')
  const latest = new Map<string, ConnRow>()
  for (const c of conns.data as unknown as ConnRow[]) if (!latest.has(c.request_item_id)) latest.set(c.request_item_id, c)

  const lastAction = new Map<string, LastAction>()
  const ids = [...latest.values()].map((c) => c.id)
  if (ids.length) {
    const events = await db
      .from('events')
      .select('action, connection_id:payload->>connection_id')
      .eq('firm_id', firmId)
      .eq('request_id', requestId)
      .in('action', ['esign.viewed', 'esign.started'])
      .in('payload->>connection_id', ids)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    if (events.error) throw new Error('event_list_failed')
    for (const e of events.data as unknown as { action: LastAction; connection_id: string }[])
      if (!lastAction.has(e.connection_id)) lastAction.set(e.connection_id, e.action)
  }

  const mapping = docusealConfigured(env) ? await getEsignMapping(env, firmId) : null
  return items.data.map((item) => {
    const raw = (item.config as Record<string, unknown> | null)?.template
    const template_key = isEsignTemplateKey(raw) ? raw : null
    const c = latest.get(item.id)
    return {
      item_id: item.id,
      template_key,
      configured: Boolean(mapping && template_key && mapping[template_key] != null),
      connection: c
        ? {
            id: c.id,
            status: c.status,
            stage: esignStage(c.status, lastAction.get(c.id) ?? null, c.error_code),
            env: c.env === 'production' ? 'production' : 'test',
            error_code: c.error_code,
            completed_at: c.completed_at,
          }
        : null,
    }
  })
}
