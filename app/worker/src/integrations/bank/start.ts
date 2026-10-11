import { createAdminClient } from '../../db/client'
import {
  getSecret,
  insertConnection,
  latestConnectionForItem,
  recordConnectionEvent,
  setConnectionStatus,
  updateConnection,
} from '../../db/connections'
import { ProviderError } from '../provider-error'
import type { StartCtx } from '../truv/start'
import { bankProvider } from './index'
import { statementsWindow } from './plaid/link'
import type { BankCapabilities } from './provider'

const REUSE_WINDOW_MS = 30 * 60 * 1000

async function firmName(env: Env, firmId: string): Promise<string> {
  const { data, error } = await createAdminClient(env).from('firms').select('name').eq('id', firmId).maybeSingle()
  if (error) throw new Error('firm_lookup_failed')
  return (data as { name: string } | null)?.name || 'ResSpark'
}

// D-08 / BANK-01: a fresh Hosted Link token on every tap, from a row that exists before the URL.
export async function startBank(
  env: Env,
  ctx: StartCtx & { origin: string }
): Promise<{ connection_id: string; hosted_link_url: string; capabilities: BankCapabilities; reused_row: boolean }> {
  const { client, item, caseRow, origin } = ctx
  const provider = bankProvider(env)
  const existing = await latestConnectionForItem(env, item.id)
  const reused_row = Boolean(
    existing?.kind === 'bank' &&
      existing.status === 'pending' &&
      Date.now() - Date.parse(existing.created_at) < REUSE_WINDOW_MS &&
      !(await getSecret(env, existing.id))
  )
  const conn = reused_row
    ? existing!
    : await insertConnection(env, {
        firm_id: client.firmId,
        request_id: client.requestId,
        request_item_id: item.id,
        case_id: caseRow.id,
        provider: provider.id,
        kind: 'bank',
      })
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')
  const window = statementsWindow(new Date())
  let session: Awaited<ReturnType<typeof provider.createLinkSession>>
  try {
    session = await provider.createLinkSession(env, {
      connectionId: conn.id,
      requestId: client.requestId,
      firmName: await firmName(env, client.firmId),
      webhookUrl: `${origin}/api/webhooks/plaid`,
      returnUrl: `${origin}/c/return?nonce=${nonce}`,
      statementsStart: window.start_date,
      statementsEnd: window.end_date,
    })
  } catch (e) {
    if (e instanceof ProviderError) await setConnectionStatus(env, conn.id, 'error', { code: e.code })
    throw e
  }
  // Overwriting the nonce retires the previous tap's return URL.
  await updateConnection(env, conn.id, {
    link_ref: session.linkRef,
    return_nonce: nonce,
    data: { ...conn.data, link_expires_at: session.expiresAt },
  })
  await recordConnectionEvent(env, conn.id, 'connection.started', { provider: provider.id, reused_row }, {
    type: 'client',
    id: `link:${client.linkId}`,
  })
  return { connection_id: conn.id, hosted_link_url: session.url, capabilities: provider.capabilities, reused_row }
}
