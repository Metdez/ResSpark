import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { isEsignTemplateKey } from '../../../src/lib/esign-templates'
import { getEsignMapping, setEsignMapping, type EsignMapping } from '../db/esign-settings'
import { docusealConfigured, getTemplate, listTemplates } from '../integrations/esign/docuseal'
import { ProviderError } from '../integrations/provider-error'
import { staffAuth, type StaffCtx } from '../middleware/staff-auth'

type App = { Bindings: Env; Variables: { staff: StaffCtx } }

const fail = (status: 400 | 403 | 422 | 502 | 503, code: string) => new HTTPException(status, { message: code })
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const validId = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v) && v > 0)

// D-01: keys outside the three-key whitelist are refused before any value is looked at.
function parsePatch(body: unknown): Partial<EsignMapping> {
  if (!isObj(body) || Object.keys(body).length === 0) throw fail(400, 'bad_request')
  if (!Object.keys(body).every(isEsignTemplateKey)) throw fail(400, 'bad_template')
  if (!Object.values(body).every(validId)) throw fail(400, 'bad_request')
  return body as Partial<EsignMapping>
}

// D-11: a mapped template must exist in DocuSeal and have exactly one signer role.
async function checkTemplate(env: Env, id: number) {
  if (!docusealConfigured(env)) throw fail(503, 'provider_not_configured')
  let submitters: number
  try {
    submitters = (await getTemplate(env, id)).submitters.length
  } catch (e) {
    if (e instanceof ProviderError && e.status === 404) throw fail(422, 'template_not_found')
    if (e instanceof ProviderError) throw fail(502, 'provider_error')
    throw e
  }
  if (submitters !== 1) throw fail(422, 'template_not_single_signer')
}

// staffAuth is scoped to /esign/*, not '*', so it never runs again for sibling /api/admin routes.
export const adminEsignRoute = new Hono<App>()
  .use('/esign/*', staffAuth)
  .get('/esign/settings', async (c) =>
    c.json({
      configured: docusealConfigured(c.env),
      env: c.env.DOCUSEAL_ENV === 'production' ? 'production' : 'test',
      mapping: await getEsignMapping(c.env, c.var.staff.firmId),
    })
  )
  .get('/esign/templates', async (c) => {
    if (!docusealConfigured(c.env)) throw fail(503, 'provider_not_configured')
    try {
      return c.json({ templates: await listTemplates(c.env) })
    } catch (e) {
      if (e instanceof ProviderError) throw fail(502, 'provider_error')
      throw e
    }
  })
  // T-06-20: admin only; the change is logged with the actor by setEsignMapping.
  .put('/esign/templates', async (c) => {
    const { staff } = c.var
    if (staff.role !== 'admin') throw fail(403, 'forbidden')
    const patch = parsePatch(await c.req.json().catch(() => null))
    for (const id of Object.values(patch)) if (typeof id === 'number') await checkTemplate(c.env, id)
    return c.json({ mapping: await setEsignMapping(c.env, staff.firmId, patch, staff.userId) })
  })
