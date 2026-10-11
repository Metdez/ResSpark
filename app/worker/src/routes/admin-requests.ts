import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { hmacKey, mintLinkToken, uuidToBytes } from '../auth/client-link'
import { DASHBOARD_STATUSES, type DashboardStatus, listDashboardRequests, sanitizeQuery } from '../db/dashboard'
import { createRequest, getRequest, getTemplates, type TemplateItem } from '../db/requests'
import { RPC_TOKENS } from '../db/rpc-error'
import { staffAuth, type StaffCtx } from '../middleware/staff-auth'

export type AdminApp = { Bindings: Env; Variables: { staff: StaffCtx; errorCode?: string } }

const KINDS: readonly string[] = [
  'bank_connect',
  'payroll_connect',
  'address',
  'upload',
  'signature',
  'intake',
] satisfies TemplateItem['kind'][]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ITEMS = 50

const RPC_STATUS: Record<(typeof RPC_TOKENS)[number], 400 | 404 | 409> = {
  no_items: 400,
  case_not_found: 404,
  request_not_found: 404,
  request_not_draft: 409,
  request_not_active: 409,
  request_revoked: 409,
  link_inactive: 409,
}

export const badRequest = () => new HTTPException(400, { message: 'bad_request' })
export const notFound = () => new HTTPException(404, { message: 'not_found' })

// RPC RAISE tokens become fixed codes; anything else falls through to onError's 500.
export function rpcToHttp(e: unknown): unknown {
  const token = e instanceof Error ? (RPC_TOKENS as readonly string[]).find((t) => t === e.message) : undefined
  if (!token) return e
  const code = token === 'request_not_found' ? 'not_found' : token
  return new HTTPException(RPC_STATUS[token as keyof typeof RPC_STATUS], { message: code })
}

export const readBody = async (c: Context<AdminApp>): Promise<Record<string, unknown>> => {
  const body: unknown = await c.req.json().catch(() => null)
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}

export function requestIdParam(c: Context<AdminApp>): string {
  const id = c.req.param('id') ?? ''
  if (!UUID.test(id)) throw badRequest()
  return id
}

// D-17: the URL is minted per response from the link row and never stored; null once revoked or expired.
export async function linkUrl(
  c: Context<AdminApp>,
  link: { id: string; version: number; revoked_at: string | null; expires_at?: string | null }
): Promise<string | null> {
  if (link.revoked_at) return null
  if (link.expires_at && Date.parse(link.expires_at) <= Date.now()) return null
  const token = await mintLinkToken(await hmacKey(c.env.CLIENT_LINK_HMAC_KEY), uuidToBytes(link.id), link.version)
  return `${new URL(c.req.url).origin}/c/${token}`
}

const isConfig = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)

// Rebuilt key by key so only the four known fields reach the RPC.
function parseItem(v: unknown): TemplateItem | null {
  if (!isConfig(v)) return null
  const { kind, label, required, config } = v as Record<string, unknown>
  if (typeof kind !== 'string' || !KINDS.includes(kind)) return null
  if (typeof label !== 'string' || label.trim() === '' || label.length > 120) return null
  if (typeof required !== 'boolean' || !isConfig(config)) return null
  return { kind: kind as TemplateItem['kind'], label: label.trim(), required, config: config as Record<string, unknown> }
}

export const adminRequestsRoute = new Hono<AdminApp>()
  .use('*', staffAuth)
  .get('/templates', async (c) => c.json({ templates: await getTemplates(c.env, c.var.staff.firmId) }))
  // No dedupe: a second packet for the same case is a legitimate second draft.
  .post('/', async (c) => {
    const { case_id, template_id, items } = await readBody(c)
    if (typeof case_id !== 'string' || !UUID.test(case_id)) throw badRequest()
    if (typeof template_id !== 'string' || !UUID.test(template_id) || !Array.isArray(items)) throw badRequest()
    if (items.length === 0) throw new HTTPException(400, { message: 'no_items' })
    if (items.length > MAX_ITEMS) throw badRequest()
    const parsed = items.map(parseItem)
    if (parsed.some((i) => i === null)) throw badRequest()
    const { staff } = c.var
    const template = (await getTemplates(c.env, staff.firmId)).find((t) => t.id === template_id)
    if (!template) throw notFound()
    try {
      const request_id = await createRequest(c.env, {
        firm_id: staff.firmId,
        case_id,
        template_name: template.name,
        items: parsed as TemplateItem[],
        created_by: staff.userId,
        agent_display_name: staff.displayName,
      })
      return c.json({ request_id }, 201)
    } catch (e) {
      throw rpcToHttp(e)
    }
  })
  // D-07: the dashboard and the Phase 2 requests page share this list; rows keep every Phase 2 key.
  .get('/', async (c) => {
    const { status: rawStatus, q: rawQ } = c.req.query()
    if (rawStatus !== undefined && !(DASHBOARD_STATUSES as readonly string[]).includes(rawStatus)) throw badRequest()
    const status = rawStatus as DashboardStatus | undefined
    const q = sanitizeQuery(rawQ) || undefined
    return c.json({ requests: await listDashboardRequests(c.env, c.var.staff.firmId, { status, q }) })
  })
  .get('/:id', async (c) => {
    const found = await getRequest(c.env, c.var.staff.firmId, requestIdParam(c))
    if (!found) throw notFound()
    const { request, items, link, case: kase } = found
    return c.json({
      id: request.id,
      firm_id: request.firm_id,
      status: request.status,
      template_name: request.template_name,
      agent_display_name: request.agent_display_name,
      contact_email: request.contact_email,
      contact_phone_e164: request.contact_phone_e164,
      sent_at: request.sent_at,
      opened_at: request.opened_at,
      created_at: request.created_at,
      case: kase && {
        case_id: kase.id,
        logics_case_id: kase.logics_case_id,
        first_name: kase.first_name,
        last_name: kase.last_name,
        email: kase.email,
        phone_e164: kase.phone_e164,
      },
      items,
      link: link && {
        url: await linkUrl(c, link),
        version: link.version,
        expires_at: link.expires_at,
        revoked_at: link.revoked_at,
        opened_at: link.opened_at,
      },
    })
  })
