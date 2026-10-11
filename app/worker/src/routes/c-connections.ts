import { Hono, type Context, type MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { CONSENT_TEXT, consentKindForItem, type ConsentKind } from '../../../src/lib/consent-text'
import { isInWindow } from '../../../src/lib/statement-months'
import { getCase } from '../db/cases'
import { findConnectionAccount, getAccountCells, setMonthCell } from '../db/bank'
import { getConnection, recordConnectionEvent, type ConnectionStatus, type ProviderId } from '../db/connections'
import { latestItemSummary, type ConnectionSummary, type MonthCell } from '../db/connections-ops'
import { hasConsent, recordConsent } from '../db/consents'
import { findSessionDocument, findSessionItem, sessionRequest, type ItemRow } from '../db/documents'
import { logEvent } from '../db/events'
import { PROVIDER_CAPABILITIES } from '../integrations/bank/provider'
import { startBank } from '../integrations/bank/start'
import { providerConfigured } from '../integrations/configured'
import { ProviderError } from '../integrations/provider-error'
import { startPayroll } from '../integrations/truv/start'
import { allowInWindow } from '../middleware/link-rate-limit'
import { clientSession, requireClientHeader, type ClientCtx } from '../middleware/client-session'

type Env_ = { Bindings: Env; Variables: { client: ClientCtx; errorCode?: string } }
type Ctx = Context<Env_>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONNECT_KINDS = ['bank_connect', 'payroll_connect'] as const
type ConnectKind = (typeof CONNECT_KINDS)[number]
const AGENT_CLASSES = ['phone', 'tablet', 'desktop'] as const

function fail(c: Ctx, status: ContentfulStatusCode, code: string, message: string) {
  c.set('errorCode', code)
  return c.json({ error: { code, message } }, status)
}
const notFound = (c: Ctx) => fail(c, 404, 'not_found', 'Not found')
const badRequest = (c: Ctx) => fail(c, 400, 'bad_request', 'That request was not valid.')
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isConnectKind = (k: string): k is ConnectKind => (CONNECT_KINDS as readonly string[]).includes(k)

// Same as c-uploads: an earlier /api/c route may already have resolved the cookie.
const session_: MiddlewareHandler<Env_> = (c, next) =>
  (c.var.client as ClientCtx | undefined) ? next() : clientSession(c, next)

const itemOf = async (c: Ctx, itemId: unknown): Promise<ItemRow | null> =>
  typeof itemId === 'string' && UUID.test(itemId) ? findSessionItem(c.env, { request_id: c.var.client.requestId }, itemId) : null

const providerFor = (env: Env, kind: ConnectKind): ProviderId => (kind === 'payroll_connect' ? 'truv' : (env.BANK_PROVIDER as ProviderId))

// The ip itself is never stored, only its family.
const ipClass = (ip: string | undefined) => (!ip ? 'unknown' : ip.includes(':') ? 'ipv6' : /^[\d.]+$/.test(ip) ? 'ipv4' : 'unknown')

export interface ClientConnectionView {
  id: string
  status: ConnectionStatus
  error_code: string | null
  accounts: Array<{ id: string; mask: string | null; name: string | null; months: Array<{ year: number; month: number; status: MonthCell['status'] }> }>
  employers: Array<{ company_name: string | null; status: 'pending' | 'connected' | 'done' | 'error'; pay_stubs: number; w2s: number }>
}

// T-04-15: explicit field list; document ids, timestamps, external ids and tokens never cross.
export function clientConnectionView(s: ConnectionSummary): ClientConnectionView {
  return {
    id: s.id,
    status: s.status,
    error_code: s.error?.code ?? null,
    accounts: s.accounts.map((a) => ({
      id: a.id,
      mask: a.mask,
      name: a.name,
      months: a.months.map((m) => ({ year: m.year, month: m.month, status: m.status })),
    })),
    employers: s.employers.map((e) => ({ company_name: e.company_name, status: e.status, pay_stubs: e.pay_stubs, w2s: e.w2s })),
  }
}

export const cConnectionsRoute = new Hono<Env_>()
  .get('/items/:itemId/connection', session_, async (c) => {
    const item = await itemOf(c, c.req.param('itemId'))
    if (!item) return notFound(c)
    if (!isConnectKind(item.kind)) return fail(c, 409, 'item_not_connect', 'This step does not connect an account.')
    const id = providerFor(c.env, item.kind)
    const consentKind = consentKindForItem(item.kind)
    const [consented, summary] = await Promise.all([
      hasConsent(c.env, c.var.client.linkId, consentKind, CONSENT_TEXT[consentKind].version),
      latestItemSummary(c.env, item.id),
    ])
    return c.json({
      provider: { id, configured: providerConfigured(c.env, id), capabilities: PROVIDER_CAPABILITIES[id] ?? null },
      consented,
      connection: summary ? clientConnectionView(summary) : null,
    })
  })
  .post('/consents', session_, requireClientHeader, async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isObject(body)) return badRequest(c)
    const { kind, text_version, user_agent_class } = body
    if (kind !== 'bank_data' && kind !== 'payroll_data') return badRequest(c)
    if (typeof text_version !== 'string' || text_version.length > 32) return badRequest(c)
    if (text_version !== CONSENT_TEXT[kind as ConsentKind].version)
      return fail(c, 409, 'consent_text_stale', 'The wording changed. Reload the page and try again.')
    const client = c.var.client
    const { created } = await recordConsent(c.env, {
      firm_id: client.firmId,
      link_id: client.linkId,
      request_id: client.requestId,
      kind,
      text_version,
      ip_class: ipClass(c.req.header('cf-connecting-ip')),
      user_agent_class: (AGENT_CLASSES as readonly unknown[]).includes(user_agent_class)
        ? (user_agent_class as (typeof AGENT_CLASSES)[number])
        : null,
    })
    if (created)
      await logEvent(c.env, {
        firm_id: client.firmId,
        request_id: client.requestId,
        actor_type: 'client',
        actor_id: `link:${client.linkId}`,
        action: `consent.${kind}`,
        payload: { kind, text_version },
      })
    return c.json({ consented: true })
  })
  .post('/connections/:kind/start', session_, requireClientHeader, async (c) => {
    const kind = c.req.param('kind')
    if (kind !== 'bank' && kind !== 'payroll') return notFound(c)
    const body: unknown = await c.req.json().catch(() => null)
    if (!isObject(body) || typeof body.item_id !== 'string' || !UUID.test(body.item_id)) return badRequest(c)
    const item = await itemOf(c, body.item_id)
    if (!item) return notFound(c)
    if (item.kind !== `${kind}_connect`) return fail(c, 409, 'item_kind_mismatch', 'This step connects something else.')
    if (item.status === 'approved') return fail(c, 409, 'item_approved', 'Your agent already approved this item.')
    const client = c.var.client
    // D-12: the consent gate precedes every vendor call (T-04-13).
    const consentKind = consentKindForItem(item.kind as ConnectKind)
    if (!(await hasConsent(c.env, client.linkId, consentKind, CONSENT_TEXT[consentKind].version)))
      return fail(c, 409, 'consent_required', 'Please agree to the data use first.')
    const providerId = providerFor(c.env, item.kind as ConnectKind)
    if (!providerConfigured(c.env, providerId)) return fail(c, 503, 'provider_not_configured', 'Provider not configured')

    const req = await sessionRequest(c.env, client.requestId, client.firmId)
    const caseRow = req ? await getCase(c.env, client.firmId, req.case_id) : null
    if (!caseRow) return notFound(c)
    try {
      if (kind === 'bank') {
        const bank = await startBank(c.env, { client, item, caseRow, origin: new URL(c.req.url).origin })
        return c.json({
          connection_id: bank.connection_id,
          kind: 'bank',
          provider: providerId,
          capabilities: bank.capabilities,
          hosted_link_url: bank.hosted_link_url,
        })
      }
      const started = await startPayroll(c.env, { client, item, caseRow })
      return c.json({
        connection_id: started.connection_id,
        kind: 'payroll',
        provider: 'truv',
        capabilities: null,
        bridge_token: started.bridge_token,
      })
    } catch (e) {
      if (e instanceof ProviderError) return fail(c, 502, 'provider_error', e.code)
      throw e
    }
  })
  // D-04: the client return only enqueues; status comes from the provider read in the job.
  .post('/connections/:id/reconcile', session_, requireClientHeader, async (c) => {
    const client = c.var.client
    if (!allowInWindow(`rc:${client.linkId}`, 10, 60_000)) return fail(c, 429, 'rate_limited', 'Too many tries. Wait a minute.')
    const id = c.req.param('id')
    const conn = UUID.test(id) ? await getConnection(c.env, id) : null
    if (!conn || conn.request_id !== client.requestId) return notFound(c)
    await c.env.JOBS.send({ type: 'reconcile', ref: conn.id })
    return c.json({ queued: true }, 202)
  })
  // D-10 / BANK-03: a client-uploaded statement fills one account-month cell (T-04-22: every id is
  // scoped to the session's request, the connection and the item; uniform 404s).
  .post('/connections/:id/statements/manual', session_, requireClientHeader, async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isObject(body)) return badRequest(c)
    const { document_id, bank_account_id, year, month } = body
    if (typeof document_id !== 'string' || !UUID.test(document_id)) return badRequest(c)
    if (typeof bank_account_id !== 'string' || !UUID.test(bank_account_id)) return badRequest(c)
    if (!Number.isInteger(year) || !Number.isInteger(month) || (month as number) < 1 || (month as number) > 12) return badRequest(c)
    const cell = { year: year as number, month: month as number }
    const client = c.var.client
    const id = c.req.param('id')
    const conn = UUID.test(id) ? await getConnection(c.env, id) : null
    if (!conn || conn.request_id !== client.requestId || conn.kind !== 'bank') return notFound(c)
    const doc = await findSessionDocument(c.env, { request_id: client.requestId }, document_id)
    if (!doc || doc.request_item_id !== conn.request_item_id) return notFound(c)
    if (doc.status !== 'ready') return fail(c, 409, 'document_not_ready', 'That upload is not finished yet.')
    const account = await findConnectionAccount(c.env, conn.id, bank_account_id)
    if (!account) return notFound(c)
    if (!isInWindow(cell, new Date())) return badRequest(c)
    const current = (await getAccountCells(c.env, account.id)).find((m) => m.year === cell.year && m.month === cell.month)
    if (current?.status === 'available') return fail(c, 409, 'month_available', 'That month already came from your bank.')
    await setMonthCell(c.env, account.id, cell.year, cell.month, 'manual', document_id)
    await recordConnectionEvent(c.env, conn.id, 'statement.manual_attributed', { bank_account_id, ...cell, document_id }, {
      type: 'client',
      id: `link:${client.linkId}`,
    })
    return c.json({ status: 'manual' })
  })
