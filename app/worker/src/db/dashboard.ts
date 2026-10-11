import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

export const DASHBOARD_STATUSES = ['sent', 'opened', 'in_progress', 'waiting_on_staff', 'complete', 'revoked'] as const
export type DashboardStatus = (typeof DASHBOARD_STATUSES)[number]

export interface DashboardRow {
  id: string
  case_id: string
  status: string
  template_name: string
  agent_display_name: string | null
  client_name: string
  first_name: string | null
  last_name: string | null
  email: string | null
  created_at: string
  sent_at: string | null
  opened_at: string | null
  completed_at: string | null
  expires_at: string | null
  last_activity_at: string | null
  overdue: boolean
}

const COLUMNS =
  'id, case_id, status, template_name, agent_display_name, first_name, last_name, email, created_at, sent_at, opened_at, completed_at, expires_at, last_activity_at, overdue'

type Name = { first_name: string | null; last_name: string | null; email: string | null }

export function clientName(r: Name): string {
  return [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Unknown client'
}

// T-03-17: q is spliced into a PostgREST or(...) expression, where `,` `(` `)` `*` would change its meaning.
export function sanitizeQuery(q: string | undefined): string {
  return (q ?? '')
    .replace(/[^A-Za-z0-9@._'\- ]/g, '')
    .replace(/ +/g, ' ')
    .trim()
    .slice(0, 64)
    .trim()
}

export async function listDashboardRequests(
  env: DbEnv,
  firmId: string,
  opts: { status?: DashboardStatus; q?: string }
): Promise<DashboardRow[]> {
  let query = createAdminClient(env).from('request_dashboard_v').select(COLUMNS).eq('firm_id', firmId)
  query = opts.status ? query.eq('status', opts.status) : query.neq('status', 'draft')
  const q = sanitizeQuery(opts.q)
  if (q) query = query.or(`first_name.ilike.*${q}*,last_name.ilike.*${q}*,email.ilike.*${q}*`)
  const { data, error } = await query
    .order('last_activity_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    // shortcut: no server paging; upgrade to keyset paging on (last_activity_at, id) once a firm has 200+ open requests.
    .limit(200)
  if (error) throw new Error('requests_lookup_failed')
  return (data as unknown as Omit<DashboardRow, 'client_name'>[]).map((r) => ({ ...r, client_name: clientName(r) }))
}
