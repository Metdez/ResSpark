import { getCase, type CaseRow } from './cases'
import { createAdminClient } from './client'
import { rpcErrorToken } from './rpc-error'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export type ItemKind = 'bank_connect' | 'payroll_connect' | 'address' | 'upload' | 'signature' | 'intake'

export interface TemplateItem {
  kind: ItemKind
  label: string
  required: boolean
  config: Record<string, unknown>
}

export interface Template {
  id: string
  name: string
  items: TemplateItem[]
}

export interface RequestRow {
  id: string
  firm_id: string
  case_id: string
  template_name: string
  status: string
  contact_email: string | null
  contact_phone_e164: string | null
  sent_at: string | null
  opened_at: string | null
  created_at: string
  agent_display_name: string | null
}

export interface RequestItemRow {
  id: string
  position: number
  kind: ItemKind
  label: string
  required: boolean
  status: string
  config: Record<string, unknown>
  rejection_note: string | null
}

export interface LinkRow {
  id: string
  version: number
  expires_at: string
  revoked_at: string | null
  opened_at: string | null
}

export interface RequestBundle {
  request: RequestRow
  case: CaseRow | null
  items: RequestItemRow[]
  link: LinkRow | null
  firm_name: string
}

export interface IssuedLink {
  link_id: string
  version: number
  expires_at: string
}

const REQUEST_COLUMNS =
  'id, firm_id, case_id, template_name, status, contact_email, contact_phone_e164, sent_at, opened_at, created_at, agent_display_name'

const fail = (error: { message?: string }, fallback: string) => new Error(rpcErrorToken(error) ?? fallback)

// The link RPCs return TABLE (link_id, version, expires_at): one row in an array.
function firstRow(data: unknown, fallback: string): IssuedLink {
  const row = (data as IssuedLink[] | null)?.[0]
  if (!row) throw new Error(fallback)
  return row
}

// Global templates (firm_id NULL) plus the firm's own.
export async function getTemplates(env: DbEnv, firmId: string): Promise<Template[]> {
  const { data, error } = await createAdminClient(env)
    .from('request_templates')
    .select('id, name, items')
    .or(`firm_id.is.null,firm_id.eq.${firmId}`)
    .order('name')
  if (error) throw new Error('templates_lookup_failed')
  return data as Template[]
}

// request_create inserts the request, its items at positions 1..N in array order, and request.created.
export async function createRequest(
  env: DbEnv,
  input: {
    firm_id: string
    case_id: string
    template_name: string
    items: TemplateItem[]
    created_by: string
    agent_display_name: string | null
  }
): Promise<string> {
  const { data, error } = await createAdminClient(env).rpc('request_create', {
    p_firm_id: input.firm_id,
    p_case_id: input.case_id,
    p_template_name: input.template_name,
    p_items: input.items,
    p_created_by: input.created_by,
    p_agent_display_name: input.agent_display_name,
  })
  if (error) throw fail(error, 'request_create_failed')
  return data as string
}

// Firm-scoped first (Pattern 2): another firm's request id reads as null.
export async function getRequest(env: DbEnv, firmId: string, id: string): Promise<RequestBundle | null> {
  const db = createAdminClient(env)
  const { data, error } = await db
    .from('requests')
    .select(REQUEST_COLUMNS)
    .eq('firm_id', firmId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error('request_lookup_failed')
  if (!data) return null
  const request = data as RequestRow
  const [items, link, firm, kase] = await Promise.all([
    db
      .from('request_items')
      .select('id, position, kind, label, required, status, config, rejection_note')
      .eq('request_id', id)
      .order('position'),
    db
      .from('client_links')
      .select('id, version, expires_at, revoked_at, opened_at')
      .eq('firm_id', firmId)
      .eq('request_id', id)
      .maybeSingle(),
    db.from('firms').select('name').eq('id', firmId).maybeSingle(),
    getCase(env, firmId, request.case_id),
  ])
  if (items.error || link.error || firm.error) throw new Error('request_lookup_failed')
  return {
    request,
    case: kase,
    items: items.data as RequestItemRow[],
    link: link.data as LinkRow | null,
    firm_name: (firm.data as { name: string } | null)?.name ?? '',
  }
}

export async function sendRequest(
  env: DbEnv,
  input: {
    request_id: string
    firm_id: string
    actor_id: string
    contact_email: string
    contact_phone_e164: string
    payload: Record<string, unknown>
  }
): Promise<IssuedLink> {
  const { data, error } = await createAdminClient(env).rpc('request_send', {
    p_request_id: input.request_id,
    p_firm_id: input.firm_id,
    p_actor_id: input.actor_id,
    p_contact_email: input.contact_email,
    p_contact_phone_e164: input.contact_phone_e164,
    p_payload: input.payload,
  })
  if (error) throw fail(error, 'request_send_failed')
  return firstRow(data, 'request_send_failed')
}

export async function regenerateLink(
  env: DbEnv,
  input: { request_id: string; firm_id: string; actor_id: string }
): Promise<IssuedLink> {
  const { data, error } = await createAdminClient(env).rpc('request_regenerate_link', {
    p_request_id: input.request_id,
    p_firm_id: input.firm_id,
    p_actor_id: input.actor_id,
  })
  if (error) throw fail(error, 'request_regenerate_failed')
  return firstRow(data, 'request_regenerate_failed')
}

export async function revokeRequest(
  env: DbEnv,
  input: { request_id: string; firm_id: string; actor_id: string }
): Promise<void> {
  const { error } = await createAdminClient(env).rpc('request_revoke', {
    p_request_id: input.request_id,
    p_firm_id: input.firm_id,
    p_actor_id: input.actor_id,
  })
  if (error) throw fail(error, 'request_revoke_failed')
}
