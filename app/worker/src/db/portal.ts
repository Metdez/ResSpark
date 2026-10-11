import type { ClientCtx } from '../middleware/client-session'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export interface PortalStep {
  id: string
  position: number
  kind: 'bank_connect' | 'payroll_connect' | 'address' | 'upload' | 'signature' | 'intake'
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

// RED stub: replaced in the GREEN commit.
export async function getPortalState(_env: DbEnv, _client: ClientCtx): Promise<PortalState | null> {
  throw new Error('not_implemented')
}
export async function openRequest(_env: DbEnv, _linkId: string): Promise<string> {
  throw new Error('not_implemented')
}
export async function upsertClientSession(
  _env: DbEnv,
  _input: { link_id: string; last_step: string | null; last_error: string | null; user_agent_class: 'phone' | 'tablet' | 'desktop' | null }
): Promise<void> {
  throw new Error('not_implemented')
}
