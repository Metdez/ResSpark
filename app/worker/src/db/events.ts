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

export async function logEvent(
  _env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
  _input: EventInput
): Promise<number> {
  throw new Error('not implemented')
}
