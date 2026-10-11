import { ESIGN_TEMPLATE_KEYS, type EsignTemplateKey } from '../../../src/lib/esign-templates'
import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export type EsignMapping = Record<EsignTemplateKey, number | null>

const positiveInt = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null)

// D-11: firms.settings.esign_templates maps each template key to a DocuSeal template id.
export async function getEsignMapping(env: DbEnv, firmId: string): Promise<EsignMapping> {
  const { data, error } = await createAdminClient(env).from('firms').select('settings').eq('id', firmId).maybeSingle()
  if (error) throw new Error('firm_lookup_failed')
  const raw = (data?.settings as Record<string, unknown> | null)?.esign_templates
  const map = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return Object.fromEntries(ESIGN_TEMPLATE_KEYS.map((k) => [k, positiveInt(map[k])])) as EsignMapping
}
