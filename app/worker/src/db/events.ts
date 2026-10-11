import { createAdminClient } from './client'

export type ActorType = 'staff' | 'client' | 'system' | 'provider'

export interface EventInput {
  firm_id: string
  case_id?: string | null
  request_id?: string | null
  actor_type: ActorType
  actor_id?: string | null
  action: string
  payload?: Record<string, unknown>
}

// The only event-writing path (D-11): log_event() inserts into the append-only events table.
export async function logEvent(
  env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
  input: EventInput
): Promise<number> {
  const admin = createAdminClient(env)
  const { data, error } = await admin.rpc('log_event', {
    p_firm_id: input.firm_id,
    p_case_id: input.case_id ?? null,
    p_request_id: input.request_id ?? null,
    p_actor_type: input.actor_type,
    p_actor_id: input.actor_id ?? null,
    p_action: input.action,
    p_payload: input.payload ?? {},
  })
  // Postgres message text never leaves this function.
  if (error) throw new Error('log_event_failed')
  return Number(data)
}
