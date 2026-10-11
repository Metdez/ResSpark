import { ESIGN_TEMPLATE_KEYS, type EsignTemplateKey } from '../../../src/lib/esign-templates'
import { createAdminClient } from './client'
import { logEvent } from './events'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export type EsignMapping = Record<EsignTemplateKey, number | null>

const positiveInt = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null)

// D-11: firms.settings.esign_templates maps each template key to a DocuSeal template id.
export async function getEsignMapping(env: DbEnv, firmId: string): Promise<EsignMapping> {
  const { data, error } = await createAdminClient(env).from('firms').select('settings').eq('id', firmId).maybeSingle()
  if (error) throw new Error('firm_lookup_failed')
  return mappingOf(data?.settings as Record<string, unknown> | null)
}

function mappingOf(settings: Record<string, unknown> | null): EsignMapping {
  const raw = settings?.esign_templates
  const map = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return Object.fromEntries(ESIGN_TEMPLATE_KEYS.map((k) => [k, positiveInt(map[k])])) as EsignMapping
}

// D-11: merges the patch into settings.esign_templates, leaving every other settings key intact.
// shortcut: read-merge-write, so two admins saving at the same moment can drop one change; upgrade to
// a single-statement jsonb update RPC when settings gain concurrent writers (same as Phase 5).
export async function setEsignMapping(env: DbEnv, firmId: string, patch: Partial<EsignMapping>, actorId: string): Promise<EsignMapping> {
  const db = createAdminClient(env)
  const { data, error } = await db.from('firms').select('settings').eq('id', firmId).single()
  if (error) throw new Error('firm_lookup_failed')
  const settings = (data.settings as Record<string, unknown> | null) ?? {}
  const keys = ESIGN_TEMPLATE_KEYS.filter((k) => k in patch)
  const mapping = { ...mappingOf(settings), ...Object.fromEntries(keys.map((k) => [k, patch[k] ?? null])) } as EsignMapping
  const { error: writeError } = await db.from('firms').update({ settings: { ...settings, esign_templates: mapping } }).eq('id', firmId)
  if (writeError) throw new Error('firm_write_failed')
  await logEvent(env, { firm_id: firmId, actor_type: 'staff', actor_id: actorId, action: 'settings.esign_templates_updated', payload: { keys } })
  return mapping
}
