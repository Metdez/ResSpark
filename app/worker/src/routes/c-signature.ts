import { Hono, type Context, type MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { CONSENT_TEXT } from '../../../src/lib/consent-text'
import { isEsignTemplateKey } from '../../../src/lib/esign-templates'
import { getCaseAddress } from '../db/case-address'
import { hasConsent } from '../db/consents'
import { findSessionItem } from '../db/documents'
import { getEsignMapping } from '../db/esign-settings'
import { getRequest } from '../db/requests'
import { docusealConfigured } from '../integrations/esign/docuseal'
import { startSignature, TemplateInvalidError } from '../integrations/esign/start'
import { ProviderError } from '../integrations/provider-error'
import { allowInWindow } from '../middleware/link-rate-limit'
import { clientSession, requireClientHeader, type ClientCtx } from '../middleware/client-session'

type Env_ = { Bindings: Env; Variables: { client: ClientCtx; errorCode?: string } }
type Ctx = Context<Env_>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fail(c: Ctx, status: ContentfulStatusCode, code: string, message: string) {
  c.set('errorCode', code)
  return c.json({ error: { code, message } }, status)
}

// Per route, not use('*'): see c-uploads.ts.
const session_: MiddlewareHandler<Env_> = (c, next) =>
  (c.var.client as ClientCtx | undefined) ? next() : clientSession(c, next)

export const cSignatureRoute = new Hono<Env_>().post('/items/:itemId/signature/start', session_, requireClientHeader, async (c) => {
  const client = c.var.client
  const itemId = c.req.param('itemId')
  const item = UUID.test(itemId) ? await findSessionItem(c.env, { request_id: client.requestId }, itemId) : null
  if (!item) return fail(c, 404, 'not_found', 'Not found')
  if (item.kind !== 'signature') return fail(c, 409, 'item_kind_mismatch', 'This step is not a signature.')
  const templateKey = item.config?.template
  // D-01: only the engagement letter, 2848 and 8821 are signable.
  if (!isEsignTemplateKey(templateKey)) return fail(c, 409, 'bad_template', 'This form cannot be signed here.')
  // Configured and mapped run before consent: never ask for agreement to something that cannot happen.
  if (!docusealConfigured(c.env)) return fail(c, 503, 'provider_not_configured', "E-sign isn't set up yet. Your agent will follow up.")
  const templateId = (await getEsignMapping(c.env, client.firmId))[templateKey]
  if (templateId === null) return fail(c, 503, 'template_not_mapped', "This form isn't ready to sign yet. Your agent will follow up.")
  // D-16 / SIGN-03: no DocuSeal call before the ESIGN consent.
  if (!(await hasConsent(c.env, client.linkId, 'esign', CONSENT_TEXT.esign.version)))
    return fail(c, 409, 'consent_required', 'Please agree to sign electronically first.')
  if (!allowInWindow('sign:' + client.linkId, 10, 60_000)) return fail(c, 429, 'rate_limited', 'Too many tries. Wait a minute.')
  if (item.status === 'approved') return fail(c, 409, 'item_approved', 'Your agent already approved this item.')

  const bundle = await getRequest(c.env, client.firmId, client.requestId)
  if (!bundle?.case) return fail(c, 404, 'not_found', 'Not found')
  const address = await getCaseAddress(c.env, bundle.case.id)
  try {
    const started = await startSignature(c.env, {
      client,
      item,
      caseRow: {
        id: bundle.case.id,
        first_name: bundle.case.first_name,
        last_name: bundle.case.last_name,
        email: bundle.case.email,
        logics_case_id: bundle.case.logics_case_id,
        address_line1: address?.line1 ?? null,
        city: address?.city ?? null,
        state_code: address?.state_code ?? null,
        zip5: address?.zip5 ?? null,
      },
      contactEmail: bundle.request.contact_email,
      templateKey,
      templateId,
    })
    // Explicit fields: `reused` stays server-side.
    return started.signed
      ? c.json({ connection_id: started.connection_id, signed: true })
      : c.json({ connection_id: started.connection_id, embed_src: started.embed_src })
  } catch (e) {
    if (e instanceof TemplateInvalidError) return fail(c, 503, 'template_invalid', "This form isn't ready to sign yet. Your agent will follow up.")
    if (e instanceof ProviderError) return fail(c, 502, 'provider_error', e.code)
    throw e
  }
})
