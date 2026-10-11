import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createMiddleware } from 'hono/factory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as addr from '../db/case-address'
import * as docs from '../db/documents'
import type { ItemRow } from '../db/documents'
import { app } from '../index'
import { _resetRateLimitForTests } from '../middleware/link-rate-limit'

// Unit tests for the client address routes: no network. db modules and fetch are mocked;
// requireClientHeader stays real; clientSession sets a fixed session.
vi.mock('../db/case-address')
vi.mock('../db/documents')
vi.mock('../middleware/client-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../middleware/client-session')>()),
  clientSession: createMiddleware(async (c, next) => {
    c.set('client', { linkId: 'L1', requestId: 'R1', firmId: 'F1', expiresAt: '2099-01-01T00:00:00Z', openedAt: null })
    await next()
  }),
}))

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../test/fixtures/smarty/${name}`, import.meta.url).href), 'utf8')
const KEYS = { SMARTY_AUTH_ID: 'id', SMARTY_AUTH_TOKEN: 'tok' }
const BASE = { SUPABASE_URL: 'https://unit.supabase.test', SUPABASE_SECRET_KEY: 'unit' }
const ENV = { ...BASE, ...KEYS } as unknown as Env
const NO_KEYS = BASE as unknown as Env
const ITEM_ID = '11111111-1111-4111-8111-111111111111'

const item = (over: Partial<ItemRow> = {}): ItemRow => ({
  id: ITEM_ID,
  request_id: 'R1',
  position: 1,
  kind: 'address',
  label: 'Confirm your address',
  required: true,
  status: 'pending',
  rejection_note: null,
  config: null,
  ...over,
})
const PICK = { source: 'smarty', street_line: '1600 Amphitheatre Pkwy', city: 'Mountain View', state: 'CA', zipcode: '94043' }
const MANUAL = { source: 'manual', street: '12 Main St', unit: '', city: 'Austin', state: 'TX', zip5: '78701' }

const suggestGet = (q: string, env = ENV) => app.request(`/api/c/address/suggest?q=${encodeURIComponent(q)}`, {}, env)
const confirm = (body: unknown, env = ENV, header = true) =>
  app.request(
    `/api/c/items/${ITEM_ID}/address`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(header ? { 'X-Requested-With': 'ResSpark' } : {}) },
      body: JSON.stringify(body),
    },
    env
  )
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const respondWith = (status: number, body: string) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'application/json' } })))

beforeEach(() => {
  _resetRateLimitForTests()
  vi.mocked(docs.findSessionItem).mockResolvedValue(item())
  vi.mocked(addr.confirmAddress).mockResolvedValue({ item_status: 'submitted', request_status: 'in_progress' })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('GET /api/c/address/suggest', () => {
  it('rejects a query under 3 characters (400)', async () => {
    const res = await suggestGet('16')
    expect(res.status).toBe(400)
    expect(await code(res)).toBe('bad_request')
  })

  it('answers 503 provider_not_configured without Smarty keys', async () => {
    const res = await suggestGet('1600 Amph', NO_KEYS)
    expect(res.status).toBe(503)
    expect(await code(res)).toBe('provider_not_configured')
  })

  it('returns the six-field suggestions', async () => {
    respondWith(200, fixture('autocomplete.json'))
    const res = await suggestGet('1600 Amph')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { suggestions: unknown[] }
    expect(body.suggestions).toHaveLength(2)
  })

  it('maps a provider 500 to 502 provider_error', async () => {
    respondWith(500, '{}')
    const res = await suggestGet('1600 Amph')
    expect(res.status).toBe(502)
    expect(await code(res)).toBe('provider_error')
  })

  it('rate-limits the 31st address call in a minute, counting POSTs in the same window', async () => {
    respondWith(200, fixture('autocomplete.json'))
    for (let i = 0; i < 15; i++) expect((await suggestGet('1600 Amph')).status).toBe(200)
    for (let i = 0; i < 15; i++) expect((await confirm(MANUAL)).status).toBe(200)
    const res = await suggestGet('1600 Amph')
    expect(res.status).toBe(429)
    expect(await code(res)).toBe('rate_limited')
  })
})

describe('POST /api/c/items/:itemId/address', () => {
  it('refuses a POST without X-Requested-With (403 bad_origin)', async () => {
    const res = await confirm(MANUAL, ENV, false)
    expect(res.status).toBe(403)
    expect(await code(res)).toBe('bad_origin')
  })

  it("answers 404 for another request's item", async () => {
    vi.mocked(docs.findSessionItem).mockResolvedValue(null)
    expect((await confirm(MANUAL)).status).toBe(404)
  })

  it('refuses an upload item with 409 item_kind_mismatch', async () => {
    vi.mocked(docs.findSessionItem).mockResolvedValue(item({ kind: 'upload' }))
    const res = await confirm(MANUAL)
    expect(res.status).toBe(409)
    expect(await code(res)).toBe('item_kind_mismatch')
  })

  it('rejects a smarty body with a 4-digit zipcode (400)', async () => {
    expect((await confirm({ ...PICK, zipcode: '1234' })).status).toBe(400)
  })

  it('answers 503 for a smarty POST without keys', async () => {
    const res = await confirm(PICK, NO_KEYS)
    expect(res.status).toBe(503)
    expect(await code(res)).toBe('provider_not_configured')
  })

  it("saves a manual address without keys: unverified, no county, line2 null for unit ''", async () => {
    const res = await confirm(MANUAL, NO_KEYS)
    expect(res.status).toBe(200)
    expect(vi.mocked(addr.confirmAddress)).toHaveBeenCalledWith(NO_KEYS, {
      itemId: ITEM_ID,
      linkId: 'L1',
      address: {
        line1: '12 Main St',
        line2: null,
        city: 'Austin',
        state_code: 'TX',
        zip5: '78701',
        zip4: null,
        county_name: null,
        county_fips: null,
        rdi: null,
        dpv: null,
        source: 'manual',
        verified: false,
      },
    })
    expect(await res.json()).toMatchObject({ verified: false, dpv: null, needs_unit: false, item_status: 'submitted' })
  })

  it('rejects a manual state outside the list (400)', async () => {
    expect((await confirm({ ...MANUAL, state: 'XX' })).status).toBe(400)
  })

  it('answers 422 address_unverifiable for a US Street [] and writes nothing', async () => {
    respondWith(200, fixture('street_empty.json'))
    const res = await confirm(PICK)
    expect(res.status).toBe(422)
    expect(await code(res)).toBe('address_unverifiable')
    expect(vi.mocked(addr.confirmAddress)).not.toHaveBeenCalled()
  })

  it('flags needs_unit for DPV D and stores it unverified', async () => {
    respondWith(200, fixture('street_d.json'))
    const res = await confirm(PICK)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ needs_unit: true, verified: false, dpv: 'D' })
    expect(vi.mocked(addr.confirmAddress).mock.calls[0][1].address).toMatchObject({ source: 'smarty', verified: false, county_fips: '49049' })
  })

  it('stores a DPV Y match as verified and never returns county facts', async () => {
    respondWith(200, fixture('street_y.json'))
    const res = await confirm(PICK)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toMatchObject({ verified: true, dpv: 'Y', needs_unit: false })
    expect(text).not.toMatch(/county|rdi|Commercial/i)
  })

  it('maps a provider error on US Street to 502', async () => {
    respondWith(401, '{}')
    const res = await confirm(PICK)
    expect(res.status).toBe(502)
    expect(await code(res)).toBe('provider_error')
  })

  it('maps item_approved from the RPC to 409', async () => {
    vi.mocked(addr.confirmAddress).mockRejectedValue(new Error('item_approved'))
    const res = await confirm(MANUAL)
    expect(res.status).toBe(409)
    expect(await code(res)).toBe('item_approved')
  })

  it('maps link_inactive from the RPC to 401 no_session', async () => {
    vi.mocked(addr.confirmAddress).mockRejectedValue(new Error('link_inactive'))
    const res = await confirm(MANUAL)
    expect(res.status).toBe(401)
    expect(await code(res)).toBe('no_session')
  })

  it('rejects an unknown source (400)', async () => {
    expect((await confirm({ ...MANUAL, source: 'gps' })).status).toBe(400)
  })
})
