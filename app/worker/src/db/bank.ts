import { createAdminClient } from './client'

type DbEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>

// Single-use: the conditional UPDATE is atomic, so two concurrent returns cannot both win.
export async function consumeReturnNonce(env: DbEnv, nonce: string): Promise<string | null> {
  const { data, error } = await createAdminClient(env)
    .from('connections')
    .update({ return_nonce_used_at: new Date().toISOString() })
    .eq('return_nonce', nonce)
    .is('return_nonce_used_at', null)
    .select('id')
    .maybeSingle()
  if (error) throw new Error('nonce_consume_failed')
  return (data as { id: string } | null)?.id ?? null
}

export async function findConnectionAccount(env: DbEnv, connectionId: string, accountId: string): Promise<{ id: string } | null> {
  const { data, error } = await createAdminClient(env)
    .from('bank_accounts')
    .select('id')
    .eq('connection_id', connectionId)
    .eq('id', accountId)
    .maybeSingle()
  if (error) throw new Error('account_lookup_failed')
  return (data as { id: string } | null) ?? null
}
