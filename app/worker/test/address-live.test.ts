import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { app } from '../src/index'
import { fixtureText } from './fixtures/connections'
import { seedPortalItems, type PortalFixture } from './fixtures/portal-items'
import { liveEnvOrSkip } from './fixtures/request'
import { stubVendorFetch } from './helpers/vendor-fetch'

// ADDR-01 against the live project with Smarty stubbed: cookie → suggest → pick → US Street →
// case_confirm_address → case columns, item submitted, an event without street text.
// Run with `pnpm -C app run test:live:file worker/test/address-live.test.ts`.
const live = liveEnvOrSkip()
const { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY } = process.env

describe.skipIf(!live)('address step (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY)', () => {
  const env = {
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    CLIENT_LINK_HMAC_KEY,
    SMARTY_AUTH_ID: 'test-id',
    SMARTY_AUTH_TOKEN: 'test-token',
  } as unknown as Env
  let db: SupabaseClient
  let fx: PortalFixture
  let other: PortalFixture
  let cookie = ''
  const stub = stubVendorFetch([
    {
      host: 'us-autocomplete-pro.api.smarty.com',
      path: '/lookup',
      respond: () => new Response(fixtureText('smarty/autocomplete.json'), { headers: { 'content-type': 'application/json' } }),
    },
    {
      host: 'us-street.api.smarty.com',
      path: '/street-address',
      respond: () => new Response(fixtureText('smarty/street_y.json'), { headers: { 'content-type': 'application/json' } }),
    },
  ])

  const post = (path: string, body: unknown) =>
    app.request(
      path,
      { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'X-Requested-With': 'ResSpark' }, body: JSON.stringify(body) },
      env
    )
  const caseRow = async () => (await db.from('cases').select('*').eq('id', fx.caseId).single()).data!
  const confirmedEvents = async () =>
    (await db.from('events').select('payload').eq('request_id', fx.requestId).eq('action', 'address.confirmed').order('id')).data!

  // Direct RPC call, for the guards the route never lets through.
  const rpcConfirm = async (itemId: string, linkId: string, address: Record<string, unknown>) =>
    db.rpc('case_confirm_address', { p_item_id: itemId, p_link_id: linkId, p_address: address })
  const SMARTY = {
    source: 'smarty',
    verified: true,
    line1: '1600 Amphitheatre Pkwy',
    line2: '',
    city: 'Mountain View',
    state_code: 'CA',
    zip5: '94043',
    zip4: '1351',
    county_name: 'Santa Clara',
    county_fips: '06085',
    rdi: 'Commercial',
    dpv: 'Y',
  }

  beforeAll(async () => {
    db = createAdminClient(env)
    fx = await seedPortalItems(env, { kinds: ['address'] })
    other = await seedPortalItems(env, { kinds: ['address'] })
    cookie = await fx.cookie()
  })

  afterAll(async () => {
    stub.restore()
    if (fx) await fx.cleanup()
    if (other) await other.cleanup()
  })

  it('suggest proxies Smarty server-side with a Basic header and returns six-key suggestions', async () => {
    const res = await app.request('/api/c/address/suggest?q=1600%20Amph', { headers: { cookie } }, env)
    expect(res.status).toBe(200)
    const { suggestions } = (await res.json()) as { suggestions: Record<string, unknown>[] }
    expect(suggestions).toHaveLength(2)
    for (const s of suggestions)
      expect(Object.keys(s).sort()).toEqual(['city', 'entries', 'secondary', 'state', 'street_line', 'zipcode'])
    const call = stub.calls.find((r) => r.url.includes('us-autocomplete-pro'))!
    expect(call.headers.get('authorization')).toBe('Basic ' + btoa('test-id:test-token'))
    expect(call.url).toContain('prefer_geolocation=none')
    expect(call.url).toContain('max_results=5')
    expect(call.url).not.toContain('auth-token')
  })

  it('confirms a picked suggestion through US Street onto the case, item submitted, street-free event', async () => {
    const started = Date.now()
    const res = await post(`/api/c/items/${fx.items.address}/address`, {
      source: 'smarty',
      street_line: '1600 Amphitheatre Pkwy',
      secondary: '',
      city: 'Mountain View',
      state: 'CA',
      zipcode: '94043',
    })
    const elapsed = Date.now() - started
    process.stdout.write(`address confirm POST took ${elapsed} ms\n`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({ verified: true, dpv: 'Y', needs_unit: false, item_status: 'submitted' })
    expect(JSON.stringify(body)).not.toMatch(/county/i)

    const call = stub.calls.find((r) => r.url.includes('us-street'))!
    const q = new URL(call.url).searchParams
    expect(q.get('candidates')).toBe('1')
    expect(call.url).toContain('match=invalid')
    expect([q.get('street'), q.get('city'), q.get('state'), q.get('zipcode')]).toEqual([
      '1600 Amphitheatre Pkwy',
      'Mountain View',
      'CA',
      '94043',
    ])

    const row = await caseRow()
    expect(row).toMatchObject({
      address_line1: '1600 Amphitheatre Pkwy',
      address_line2: null,
      zip4: '1351',
      county_name: 'Santa Clara',
      county_fips: '06085',
      address_rdi: 'Commercial',
      address_dpv: 'Y',
      address_verified: true,
      address_source: 'smarty',
    })
    expect(row.address_confirmed_at).toBeTruthy()
    const item = (await db.from('request_items').select('status').eq('id', fx.items.address!).single()).data!
    expect(item.status).toBe('submitted')
    const events = await confirmedEvents()
    expect(events).toHaveLength(1)
    expect(Object.keys(events[0].payload as object).sort()).toEqual(['county_fips', 'rdi', 'source', 'verified'])
    expect(JSON.stringify(events[0].payload)).not.toMatch(/Amphitheatre|94043/)
  })

  it("stores a smarty payload's blank line2 as NULL, not ''", async () => {
    const { error } = await rpcConfirm(fx.items.address!, fx.linkId, SMARTY)
    expect(error).toBeNull()
    expect((await caseRow()).address_line2).toBeNull()
  })

  it('a manual re-confirm while submitted replaces the address, unverified with no county, and logs again', async () => {
    const before = (await confirmedEvents()).length
    const res = await post(`/api/c/items/${fx.items.address}/address`, {
      source: 'manual',
      street: '12 Main St',
      unit: 'Apt 4',
      city: 'Austin',
      state: 'TX',
      zip5: '78701',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ verified: false, dpv: null, item_status: 'submitted' })
    expect(await caseRow()).toMatchObject({
      address_line1: '12 Main St',
      address_line2: 'Apt 4',
      zip4: null,
      county_name: null,
      county_fips: null,
      address_rdi: null,
      address_dpv: null,
      address_verified: false,
      address_source: 'manual',
    })
    const events = await confirmedEvents()
    expect(events).toHaveLength(before + 1)
    expect(events.at(-1)!.payload).toEqual({ source: 'manual', verified: false, county_fips: null, rdi: null })
  })

  it('refuses a manual payload carrying a county FIPS (bad_address)', async () => {
    const { error } = await rpcConfirm(fx.items.address!, fx.linkId, { ...SMARTY, source: 'manual', verified: false, county_name: '', rdi: '', dpv: '' })
    expect(error?.message).toContain('bad_address')
  })

  it("refuses another link's item (item_not_found)", async () => {
    const { error } = await rpcConfirm(fx.items.address!, other.linkId, SMARTY)
    expect(error?.message).toContain('item_not_found')
  })

  it('refuses a revoked link (link_inactive)', async () => {
    await db.from('client_links').update({ revoked_at: new Date().toISOString() }).eq('id', other.linkId)
    const { error } = await rpcConfirm(other.items.address!, other.linkId, SMARTY)
    expect(error?.message).toContain('link_inactive')
  })

  it('freezes an approved address (409 item_approved, case unchanged)', async () => {
    const approved = await db.rpc('item_approve', { p_item_id: fx.items.address, p_firm_id: fx.firmId, p_actor_id: 'test:address-live' })
    expect(approved.error).toBeNull()
    const before = await caseRow()
    const res = await post(`/api/c/items/${fx.items.address}/address`, {
      source: 'manual',
      street: '99 Other Rd',
      city: 'Dallas',
      state: 'TX',
      zip5: '75201',
    })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('item_approved')
    const { error } = await rpcConfirm(fx.items.address!, fx.linkId, SMARTY)
    expect(error?.message).toContain('item_approved')
    expect(await caseRow()).toEqual(before)
  })
})
