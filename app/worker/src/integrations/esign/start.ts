import type { EsignTemplateKey } from '../../../../src/lib/esign-templates'
import {
  insertConnection,
  latestConnectionForItem,
  recordConnectionEvent,
  setConnectionStatus,
  updateConnection,
} from '../../db/connections'
import type { ItemRow } from '../../db/documents'
import type { ClientCtx } from '../../middleware/client-session'
import { ProviderError } from '../provider-error'
import { createSubmission, getSubmitter, getTemplate } from './docuseal'

export interface SignStartCtx {
  client: ClientCtx
  item: ItemRow
  caseRow: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    logics_case_id: number | null
    address_line1: string | null
    city: string | null
    state_code: string | null
    zip5: string | null
  }
  contactEmail: string | null
  templateKey: EsignTemplateKey
  templateId: number
}

export type SignStartResult = { connection_id: string; embed_src?: string; signed?: true; reused: boolean }

// D-11 template contract: exactly one signer role. The route maps this to 503 template_invalid.
export class TemplateInvalidError extends Error {
  constructor() {
    super('template_invalid')
    this.name = 'TemplateInvalidError'
  }
}

const OPEN = ['pending', 'connected', 'syncing']

export async function startSignature(env: Env, ctx: SignStartCtx): Promise<SignStartResult> {
  const { client, item, caseRow, templateKey, templateId } = ctx
  const existing = await latestConnectionForItem(env, item.id)
  // D-12: a signed item stays signed.
  if (existing?.status === 'done') return { connection_id: existing.id, signed: true, reused: true }
  if (existing && OPEN.includes(existing.status)) {
    const expireAt = Date.parse(String(existing.data.expire_at))
    if (expireAt <= Date.now()) {
      // D-12: an expired submission is closed and replaced.
      await setConnectionStatus(env, existing.id, 'error', { code: 'expired' })
    } else {
      // D-12: reuse the open submission; the embed URL is fetched fresh, never stored.
      const s = await getSubmitter(env, Number(existing.data.submitter_id))
      if (s.status === 'completed') {
        await env.JOBS.send({ type: 'reconcile', ref: existing.id })
        return { connection_id: existing.id, signed: true, reused: true }
      }
      if (s.status !== 'declined') return { connection_id: existing.id, embed_src: s.embed_src, reused: true }
      // D-12: a declined submission is closed and a new one is created.
      await setConnectionStatus(env, existing.id, 'error', { code: 'declined' })
    }
  }

  const tpl = await getTemplate(env, templateId)
  if (tpl.submitters.length !== 1) throw new TemplateInvalidError()
  const name = [caseRow.first_name, caseRow.last_name].filter(Boolean).join(' ').trim()
  const candidates: Record<string, string> = {
    'Full name': name,
    'Case ID': caseRow.logics_case_id === null ? '' : String(caseRow.logics_case_id),
    Address: caseRow.address_line1
      ? `${caseRow.address_line1}, ${caseRow.city ?? ''}, ${caseRow.state_code ?? ''} ${caseRow.zip5 ?? ''}`.trim()
      : '',
  }
  const fieldNames = new Set(tpl.fields.map((f) => f.name))
  const prefill = Object.entries(candidates).filter(([n, v]) => v && fieldNames.has(n))

  // Row before URL: the connection exists before DocuSeal knows about it.
  const data = { template_key: templateKey, template_id: templateId, env: env.DOCUSEAL_ENV || 'test', expire_at: client.expiresAt }
  const conn = await insertConnection(env, {
    firm_id: client.firmId,
    request_id: client.requestId,
    request_item_id: item.id,
    case_id: caseRow.id,
    provider: 'docuseal',
    kind: 'signature',
    data,
  })
  let submitters: Awaited<ReturnType<typeof createSubmission>>
  try {
    // D-21: DocuSeal never emails or texts anyone; the portal is the only channel.
    submitters = await createSubmission(env, {
      template_id: templateId,
      send_email: false,
      send_sms: false,
      expire_at: client.expiresAt,
      submitters: [
        {
          role: tpl.submitters[0].name,
          name: name || undefined,
          email: ctx.contactEmail ?? caseRow.email ?? undefined,
          external_id: item.id,
          send_email: false,
          fields: prefill.map(([n, v]) => ({ name: n, default_value: v, readonly: true })),
        },
      ],
    })
  } catch (e) {
    if (e instanceof ProviderError) await setConnectionStatus(env, conn.id, 'error', { code: e.code })
    throw e
  }
  const [s] = submitters
  // The slug is a bearer signing link; it is never stored (reuse goes through GET /submitters/{id}).
  await updateConnection(env, conn.id, {
    external_id: String(s.submission_id),
    data: { ...data, submitter_id: s.id },
  })
  await recordConnectionEvent(env, conn.id, 'connection.started', { provider: 'docuseal', template_key: templateKey }, {
    type: 'client',
    id: `link:${client.linkId}`,
  })
  return { connection_id: conn.id, embed_src: s.embed_src, reused: false }
}
