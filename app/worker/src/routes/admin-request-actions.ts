import { Hono, type Context } from 'hono'
import { checkContact, normalizePhone } from '../../../src/lib/contact'
import type { CaseRow } from '../db/cases'
import { getIntegration } from '../db/integrations'
import { logEvent } from '../db/events'
import { getRequest, regenerateLink, revokeRequest, sendRequest, type RequestRow } from '../db/requests'
import { sendLinkEmail } from '../integrations/email/resend'
import { resolveLogicsClient } from '../integrations/logics/config'
import { fetchCaseSummary } from '../integrations/logics/lookup'
import type { LogicsCaseSummary } from '../integrations/logics/mapper'
import { staffAuth } from '../middleware/staff-auth'
import { toHttp as logicsToHttp } from './admin-lookup'
import { badRequest, linkUrl, notFound, readBody, requestIdParam, rpcToHttp, type AdminApp } from './admin-requests'

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

// Error envelope plus extra fields the SPA needs to explain the refusal.
const refuse = (c: Context<AdminApp>, status: 400 | 409, code: string, extra: Record<string, unknown>) => {
  c.set('errorCode', code)
  return c.json({ error: { code, message: code }, ...extra }, status)
}

async function loadRequest(c: Context<AdminApp>) {
  const found = await getRequest(c.env, c.var.staff.firmId, requestIdParam(c))
  if (!found) throw notFound()
  return found
}

// The actor is always the verified staff user (T-02-24).
const staffEvent = (c: Context<AdminApp>, request: RequestRow) => ({
  firm_id: c.var.staff.firmId,
  case_id: request.case_id,
  request_id: request.id,
  actor_type: 'staff' as const,
  actor_id: c.var.staff.userId,
})

// C8 / LOOK-04: the cached case is compared with a fresh CaseInfo read. The phone goes through
// normalizePhone on the fresh side, exactly as confirm did when it stored cases.phone_e164.
function changedFields(cached: CaseRow, fresh: LogicsCaseSummary): string[] {
  const freshPhone = normalizePhone(fresh.cell_phone ?? fresh.home_phone ?? fresh.work_phone ?? '')?.e164 ?? null
  const changed: string[] = []
  if (norm(fresh.first_name) !== norm(cached.first_name)) changed.push('first_name')
  if (norm(fresh.last_name) !== norm(cached.last_name)) changed.push('last_name')
  if (norm(fresh.email) !== norm(cached.email)) changed.push('email')
  if (freshPhone !== (cached.phone_e164 ?? null)) changed.push('phone')
  return changed
}

export const adminRequestActionsRoute = new Hono<AdminApp>()
  .use('*', staffAuth)
  .post('/:id/send', async (c) => {
    const { request, case: kase } = await loadRequest(c)
    if (!kase || kase.logics_case_id === null) {
      return refuse(c, 409, 'case_changed', { changed: ['logics_case_id'] })
    }
    const { email, phone, keep_flagged } = await readBody(c)
    if (typeof email !== 'string' || typeof phone !== 'string') throw badRequest()
    if (keep_flagged !== undefined && typeof keep_flagged !== 'boolean') throw badRequest()

    const check = checkContact({ email, phone })
    if (check.email === undefined || check.phone_e164 === undefined) {
      return refuse(c, 400, 'contact_invalid', { email_error: check.email_error, phone_error: check.phone_error })
    }
    const differs: ('email' | 'phone')[] = []
    if (check.email !== norm(kase.email)) differs.push('email')
    if (check.phone_e164 !== kase.phone_e164) differs.push('phone')
    // One acknowledgement covers both the did-you-mean and the differs-from-Logics flags (D-07).
    const flagged = differs.length > 0 || Boolean(check.email_suggestion)
    if (flagged && !keep_flagged) {
      return refuse(c, 409, 'contact_flagged', { email_suggestion: check.email_suggestion, differs })
    }

    let fresh: LogicsCaseSummary | null
    try {
      const { client } = await resolveLogicsClient(c.env, await getIntegration(c.env, c.var.staff.firmId, 'logics'))
      fresh = await fetchCaseSummary(client, kase.logics_case_id)
    } catch (e) {
      throw logicsToHttp(e)
    }
    if (!fresh) return refuse(c, 409, 'case_changed', { changed: ['case'] })
    const changed = changedFields(kase, fresh)
    if (changed.length > 0) return refuse(c, 409, 'case_changed', { changed })

    try {
      const issued = await sendRequest(c.env, {
        request_id: request.id,
        firm_id: c.var.staff.firmId,
        actor_id: c.var.staff.userId,
        contact_email: check.email,
        contact_phone_e164: check.phone_e164,
        payload: {
          to_email: check.email,
          to_phone_e164: check.phone_e164,
          contact_overridden: Boolean(keep_flagged) && flagged,
          logics_case_id: kase.logics_case_id,
        },
      })
      const url = await linkUrl(c, { id: issued.link_id, version: issued.version, revoked_at: null })
      return c.json({ url, expires_at: issued.expires_at, version: issued.version })
    } catch (e) {
      throw rpcToHttp(e)
    }
  })
  .post('/:id/regenerate', async (c) => {
    const { request } = await loadRequest(c)
    const { staff } = c.var
    try {
      const issued = await regenerateLink(c.env, { request_id: request.id, firm_id: staff.firmId, actor_id: staff.userId })
      const url = await linkUrl(c, { id: issued.link_id, version: issued.version, revoked_at: null })
      return c.json({ url, expires_at: issued.expires_at, version: issued.version })
    } catch (e) {
      throw rpcToHttp(e)
    }
  })
  .post('/:id/revoke', async (c) => {
    const { request } = await loadRequest(c)
    const { staff } = c.var
    try {
      await revokeRequest(c.env, { request_id: request.id, firm_id: staff.firmId, actor_id: staff.userId })
    } catch (e) {
      throw rpcToHttp(e)
    }
    return c.json({ ok: true })
  })
  // Records agreement only: the platform never sends SMS; the agent texts from their own phone (M1).
  .post('/:id/consent', async (c) => {
    const { request, case: kase } = await loadRequest(c)
    const { agreed } = await readBody(c)
    // Only the literal boolean counts: 'true', 1, or a missing field is not consent.
    if (!(agreed === true)) throw badRequest()
    const event_id = await logEvent(c.env, {
      ...staffEvent(c, request),
      action: 'consent.sms',
      payload: { phone_e164: request.contact_phone_e164 ?? kase?.phone_e164 ?? null },
    })
    return c.json({ ok: true, event_id })
  })
  // D-09: the copy is recorded whether or not email is configured. No body is read.
  .post('/:id/copied', async (c) => {
    const { request } = await loadRequest(c)
    const event_id = await logEvent(c.env, { ...staffEvent(c, request), action: 'request.link_copied', payload: {} })
    return c.json({ ok: true, event_id })
  })
  // Best-effort (D-09): always 200 with a truthful result. The recipient is the stored, validated
  // contact; no body is read, so a caller cannot redirect the email (T-02-20).
  .post('/:id/email', async (c) => {
    const { request, link, firm_name } = await loadRequest(c)
    const to = request.contact_email
    const url = link && (await linkUrl(c, link))
    if (!link || !url || !to) return c.json({ ok: false, reason: 'no_link' })
    const result = await sendLinkEmail(c.env, {
      to,
      firmName: firm_name,
      agentName: request.agent_display_name,
      url,
      expiresAt: link.expires_at,
    })
    await logEvent(c.env, {
      ...staffEvent(c, request),
      ...(result.ok
        ? { action: 'request.email_sent', payload: { to, resend_id: result.id } }
        : { action: 'request.email_failed', payload: { to, reason: result.reason } }),
    })
    return c.json(result)
  })
