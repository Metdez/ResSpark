import { Hono, type Context, type MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { isUsStateCode } from '../../../src/lib/us-states'
import { confirmAddress, type AddressPayload } from '../db/case-address'
import { findSessionItem } from '../db/documents'
import { ProviderError } from '../integrations/provider-error'
import { smartyConfigured, suggest, verifyStreet } from '../integrations/smarty/client'
import { allowInWindow } from '../middleware/link-rate-limit'
import { clientSession, requireClientHeader, type ClientCtx } from '../middleware/client-session'

type Env_ = { Bindings: Env; Variables: { client: ClientCtx; errorCode?: string } }
type Ctx = Context<Env_>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ZIP5 = /^\d{5}$/
const STATE = /^[A-Z]{2}$/

function fail(c: Ctx, status: ContentfulStatusCode, code: string, message: string) {
  c.set('errorCode', code)
  return c.json({ error: { code, message } }, status)
}
const badRequest = (c: Ctx) => fail(c, 400, 'bad_request', 'That request was not valid.')
const notConfigured = (c: Ctx) =>
  fail(c, 503, 'provider_not_configured', 'Address lookup is not available. Enter your address by hand.')
const providerFailed = (c: Ctx) =>
  fail(c, 502, 'provider_error', 'Address lookup is not working right now. Enter your address by hand.')
// Suggest and confirm share one per-link window: 30 calls a minute (T-06-02).
const allowed = (c: Ctx) => allowInWindow('addr:' + c.var.client.linkId, 30, 60_000)
const rateLimited = (c: Ctx) => fail(c, 429, 'rate_limited', 'Too many tries. Wait a minute and try again.')

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown, min: number, max: number): v is string =>
  typeof v === 'string' && v.trim().length >= min && v.trim().length <= max
const optional = (v: unknown, max: number) => v === undefined || v === null || text(v, 0, max)

// Per route, not use('*'): see c-uploads.ts (a '*' would also match clientPortalRoute's paths).
const session_: MiddlewareHandler<Env_> = (c, next) =>
  (c.var.client as ClientCtx | undefined) ? next() : clientSession(c, next)

export const cAddressRoute = new Hono<Env_>()
  .get('/address/suggest', session_, async (c) => {
    const q = (c.req.query('q') ?? '').trim()
    const selected = c.req.query('selected')
    if (q.length < 3 || q.length > 100) return badRequest(c)
    if (selected !== undefined && selected.length > 200) return badRequest(c)
    if (!allowed(c)) return rateLimited(c)
    if (!smartyConfigured(c.env)) return notConfigured(c)
    try {
      return c.json({ suggestions: await suggest(c.env, q, selected || undefined) })
    } catch (err) {
      if (err instanceof ProviderError) return providerFailed(c)
      throw err
    }
  })
  .post('/items/:itemId/address', session_, requireClientHeader, async (c) => {
    if (!allowed(c)) return rateLimited(c)
    const itemId = c.req.param('itemId')
    const item = UUID.test(itemId) ? await findSessionItem(c.env, { request_id: c.var.client.requestId }, itemId) : null
    if (!item) return fail(c, 404, 'not_found', 'Not found')
    if (item.kind !== 'address') return fail(c, 409, 'item_kind_mismatch', 'This step does not take an address.')

    const body: unknown = await c.req.json().catch(() => null)
    if (!isObject(body)) return badRequest(c)
    let address: AddressPayload
    if (body.source === 'smarty') {
      const { street_line, secondary, city, state, zipcode } = body
      if (!text(street_line, 1, 100) || !optional(secondary, 32) || !text(city, 1, 64)) return badRequest(c)
      if (typeof state !== 'string' || !STATE.test(state) || typeof zipcode !== 'string' || !ZIP5.test(zipcode))
        return badRequest(c)
      if (!smartyConfigured(c.env)) return notConfigured(c)
      let verified: Awaited<ReturnType<typeof verifyStreet>>
      try {
        verified = await verifyStreet(c.env, {
          street: street_line.trim(),
          secondary: typeof secondary === 'string' && secondary.trim() ? secondary.trim() : null,
          city: city.trim(),
          state,
          zipcode,
        })
      } catch (err) {
        if (err instanceof ProviderError) return providerFailed(c)
        throw err
      }
      // D-06: no USPS match → nothing is written; the SPA switches to the manual form.
      if (!verified) return fail(c, 422, 'address_unverifiable', "We couldn't confirm that address.")
      address = { ...verified, source: 'smarty', verified: verified.dpv === 'Y' }
    } else if (body.source === 'manual') {
      const { street, unit, city, state, zip5 } = body
      if (!text(street, 1, 100) || !optional(unit, 32) || !text(city, 1, 64)) return badRequest(c)
      if (!isUsStateCode(state) || typeof zip5 !== 'string' || !ZIP5.test(zip5)) return badRequest(c)
      address = {
        line1: street.trim(),
        line2: typeof unit === 'string' && unit.trim() ? unit.trim() : null,
        city: city.trim(),
        state_code: state,
        zip5,
        zip4: null,
        county_name: null,
        county_fips: null,
        rdi: null,
        dpv: null,
        source: 'manual',
        verified: false,
      }
    } else return badRequest(c)

    let result: Awaited<ReturnType<typeof confirmAddress>>
    try {
      result = await confirmAddress(c.env, { itemId: item.id, linkId: c.var.client.linkId, address })
    } catch (err) {
      const token = err instanceof Error ? err.message : ''
      if (token === 'link_inactive') return fail(c, 401, 'no_session', 'no_session')
      if (token === 'item_not_found') return fail(c, 404, 'not_found', 'Not found')
      if (token === 'item_approved') return fail(c, 409, 'item_approved', 'Your agent already approved this item.')
      if (token === 'bad_address') return badRequest(c)
      throw err
    }
    // County, FIPS, and RDI are staff-only facts and never go back to the phone.
    return c.json({
      address: {
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state_code: address.state_code,
        zip5: address.zip5,
        zip4: address.zip4,
      },
      verified: address.verified,
      dpv: address.dpv,
      needs_unit: address.dpv === 'D' || address.dpv === 'S',
      item_status: result.item_status,
      request_status: result.request_status,
    })
  })
