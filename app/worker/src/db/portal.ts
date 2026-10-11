import type { ClientCtx } from '../middleware/client-session'
import { createAdminClient } from './client'
import type { ItemKind } from './requests'
import { rpcErrorToken } from './rpc-error'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export interface PortalStep {
  id: string
  position: number
  kind: ItemKind
  label: string
  required: boolean
  status: 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected'
}

export interface PortalState {
  firm_name: string
  agent_display_name: string | null
  status: string
  opened_at: string | null
  expires_at: string
  steps: PortalStep[]
}

interface PortalRow {
  status: string
  agent_display_name: string | null
  firms: { name: string }
  request_items: PortalStep[]
}

// Scoped by the verified link's request and firm; the DTO is built field by field, never spread.
export async function getPortalState(env: DbEnv, client: ClientCtx): Promise<PortalState | null> {
  const { data, error } = await createAdminClient(env)
    .from('requests')
    .select('status, agent_display_name, firms!inner(name), request_items(id, position, kind, label, required, status)')
    .eq('id', client.requestId)
    .eq('firm_id', client.firmId)
    .maybeSingle()
  if (error) throw new Error('portal_lookup_failed')
  if (!data) return null
  const row = data as unknown as PortalRow
  return {
    firm_name: row.firms.name,
    agent_display_name: row.agent_display_name,
    status: row.status,
    opened_at: client.openedAt,
    expires_at: client.expiresAt,
    steps: [...row.request_items]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        position: s.position,
        kind: s.kind,
        label: s.label,
        required: s.required,
        status: s.status,
      })),
  }
}

// request_open is idempotent: the first call stamps opened_at, later calls return it unchanged.
export async function openRequest(env: DbEnv, linkId: string): Promise<string> {
  const { data, error } = await createAdminClient(env).rpc('request_open', { p_link_id: linkId })
  if (error) throw new Error(rpcErrorToken(error) ?? 'open_failed')
  return data as string
}

export async function upsertClientSession(
  env: DbEnv,
  input: {
    link_id: string
    last_step: string | null
    last_error: string | null
    user_agent_class: 'phone' | 'tablet' | 'desktop' | null
  }
): Promise<void> {
  const { error } = await createAdminClient(env)
    .from('client_sessions')
    .upsert({ ...input, seen_at: new Date().toISOString() }, { onConflict: 'link_id' })
  if (error) throw new Error('session_write_failed')
}
