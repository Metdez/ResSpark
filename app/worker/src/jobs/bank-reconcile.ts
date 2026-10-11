import {
  getSecret,
  insertConnection,
  recordConnectionEvent,
  saveSecret,
  setConnectionStatus,
  updateConnection,
  type ConnectionRow,
  type ConnectionStatus,
} from '../db/connections'
import { bankProvider } from '../integrations/bank/index'
import { openToken, sealToken } from '../integrations/token-vault'
import type { ReconcileOpts } from './reconcile'

const DAY_MS = 86_400_000
const removeAfter = (env: Env) => new Date(Date.now() + Number(env.PLAID_REMOVE_AFTER_DAYS || 30) * DAY_MS).toISOString()
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])

// D-09: only a verified SESSION_FINISHED SUCCESS (or /link/token/get results) connects a bank;
// the access token goes straight into the vault and never into rows, events or messages.
export async function reconcileBank(
  env: Env,
  conn: ConnectionRow,
  opts: ReconcileOpts
): Promise<{ status: ConnectionStatus; applied: boolean }> {
  const provider = bankProvider(env, conn.provider)
  const secret = await getSecret(env, conn.id)
  if (secret) {
    await openToken(env, conn.id, secret)
    // shortcut: 04-04 Task 2 adds the transactions sync and statements here.
    return { status: conn.status, applied: false }
  }

  const hint = opts.hint
  let publicTokens: string[] | undefined
  if (hint?.webhook_type === 'LINK') {
    if (hint.webhook_code !== 'SESSION_FINISHED') return { status: conn.status, applied: false } // EVENTS: stored, ignored
    if (hint.status !== 'SUCCESS') {
      await recordConnectionEvent(env, conn.id, 'connection.session_exited', { status: String(hint.status ?? '') })
      return { status: conn.status, applied: false }
    }
    publicTokens = strings(hint.public_tokens)
  }
  if (!conn.link_ref) return { status: conn.status, applied: false }
  const results = await provider.completeSession(env, { linkRef: conn.link_ref, publicTokens })
  if (results.length === 0) return { status: conn.status, applied: false }

  const [first, ...rest] = results
  await saveSecret(env, conn.id, await sealToken(env, conn.id, first.accessToken))
  await updateConnection(env, conn.id, {
    external_id: first.externalId,
    data: { ...conn.data, institution_name: first.institutionName },
    remove_after: removeAfter(env),
  })
  const res = await setConnectionStatus(env, conn.id, 'connected', { institution_name: first.institutionName })

  // One Link session can add several Items: each becomes a sibling connection on the same item.
  for (const r of rest) {
    const sibling = await insertConnection(env, {
      firm_id: conn.firm_id,
      request_id: conn.request_id,
      request_item_id: conn.request_item_id,
      case_id: conn.case_id,
      provider: conn.provider,
      kind: 'bank',
      external_id: r.externalId,
      data: { parent_connection_id: conn.id, institution_name: r.institutionName },
    })
    await saveSecret(env, sibling.id, await sealToken(env, sibling.id, r.accessToken))
    await updateConnection(env, sibling.id, { remove_after: removeAfter(env) })
    await setConnectionStatus(env, sibling.id, 'connected', { institution_name: r.institutionName })
    await env.JOBS.send({ type: 'reconcile', ref: sibling.id })
  }
  return { status: res.status, applied: res.applied }
}
