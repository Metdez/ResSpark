import { deleteSecret, getConnection, getSecret, recordConnectionEvent, setConnectionStatus } from '../db/connections'
import { bankProvider } from '../integrations/bank/index'
import { NonRetryableError, ProviderError } from '../integrations/provider-error'
import { openToken } from '../integrations/token-vault'

// Plaid no longer knows this token: the Item is already gone, so it counts as removed.
const GONE = ['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN']

// D-13 / BANK-06: stop Plaid billing after the retention window. Only the secret is deleted;
// documents, transactions and month cells stay in the case.
export async function removeItem(env: Env, id: string): Promise<void> {
  const conn = await getConnection(env, id)
  if (!conn) throw new NonRetryableError('connection_not_found')
  const secret = await getSecret(env, id)
  if (!secret) {
    await recordConnectionEvent(env, id, 'connection.remove_skipped', { reason: 'no_secret' }, { type: 'system' })
    return
  }
  const provider = bankProvider(env, conn.provider)
  try {
    await provider.removeConnection(env, await openToken(env, id, secret))
  } catch (e) {
    if (!(e instanceof ProviderError && GONE.includes(e.code))) throw e
  }
  await deleteSecret(env, id)
  await setConnectionStatus(env, id, 'removed', { reason: 'retention', remove_after: conn.remove_after })
}
