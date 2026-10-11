import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fixtureText } from '../../test/fixtures/connections'
import { makePlaidSigner } from '../../test/helpers/plaid-sign'
import { stubVendorFetch } from '../../test/helpers/vendor-fetch'
import { _clearPlaidKeysForTests, _setPlaidKeyForTests, plaidAdapter } from './plaid'

const env = { PLAID_CLIENT_ID: 'cid', PLAID_SECRET: 'sec', PLAID_ENV: 'sandbox' } as unknown as Env
const now = () => Math.floor(Date.now() / 1000)
const headers = (jwt: string) => new Headers({ 'plaid-verification': jwt })

describe('plaidAdapter', () => {
  let signer: Awaited<ReturnType<typeof makePlaidSigner>>
  let vendor: ReturnType<typeof stubVendorFetch> | undefined
  const success = fixtureText('plaid/session_finished_success.json')

  beforeAll(async () => {
    signer = await makePlaidSigner()
  })
  beforeEach(() => {
    _clearPlaidKeysForTests()
    _setPlaidKeyForTests(signer.kid, signer.jwk)
    // any key fetch is recorded; none is expected unless a test routes one
    vendor = stubVendorFetch([{ host: 'sandbox.plaid.com', path: /.*/, respond: () => new Response('{}', { status: 500 }) }])
  })
  afterEach(() => vendor?.restore())

  it('verifies a SESSION_FINISHED body signed with the cached key and keys it by link session', async () => {
    const v = await plaidAdapter.verify(success, headers(await signer.sign(success)), env)
    expect(v?.payload.status).toBe('SUCCESS')
    expect(typeof v?.iat).toBe('number')
    expect(plaidAdapter.eventKey(v!)).toBe('ls_fixture_1:SESSION_FINISHED')
    expect(vendor!.calls).toHaveLength(0)
  })

  it('verifies an EXITED session the same way', async () => {
    const raw = fixtureText('plaid/session_finished_exited.json')
    const v = await plaidAdapter.verify(raw, headers(await signer.sign(raw)), env)
    expect(v?.payload.status).toBe('EXITED')
    expect(plaidAdapter.eventKey(v!)).toBe('ls_fixture_2:SESSION_FINISHED')
  })

  it('rejects a body changed by one byte after signing', async () => {
    const jwt = await signer.sign(success)
    expect(await plaidAdapter.verify(success + ' ', headers(jwt), env)).toBeNull()
  })

  it('rejects an HS256 token without fetching any key', async () => {
    _clearPlaidKeysForTests()
    const jwt = await signer.sign(success, { alg: 'HS256' })
    expect(await plaidAdapter.verify(success, headers(jwt), env)).toBeNull()
    expect(vendor!.calls).toHaveLength(0)
  })

  it('rejects an iat 6 minutes old and accepts one 4 minutes old', async () => {
    expect(await plaidAdapter.verify(success, headers(await signer.sign(success, { iat: now() - 360 })), env)).toBeNull()
    expect(await plaidAdapter.verify(success, headers(await signer.sign(success, { iat: now() - 240 })), env)).not.toBeNull()
  })

  it('fetches an unknown kid once, then serves it from the cache', async () => {
    vendor!.restore()
    const fresh = await makePlaidSigner()
    vendor = stubVendorFetch([
      {
        host: 'sandbox.plaid.com',
        path: '/webhook_verification_key/get',
        method: 'POST',
        respond: () => Response.json({ key: { ...fresh.jwk, expired_at: null }, request_id: 'r' }),
      },
    ])
    expect(await plaidAdapter.verify(success, headers(await fresh.sign(success)), env)).not.toBeNull()
    expect(await plaidAdapter.verify(success, headers(await fresh.sign(success)), env)).not.toBeNull()
    expect(vendor.calls).toHaveLength(1)
    const call = vendor.calls[0]
    expect(await call.json()).toEqual({ key_id: fresh.kid })
    expect(call.headers.get('PLAID-CLIENT-ID')).toBe('cid')
    expect(call.headers.get('PLAID-SECRET')).toBe('sec')
  })

  it('treats a failed key fetch as unverifiable', async () => {
    const fresh = await makePlaidSigner()
    expect(await plaidAdapter.verify(success, headers(await fresh.sign(success)), env)).toBeNull()
    expect(vendor!.calls).toHaveLength(1)
  })

  it('keys item webhooks by item_id, webhook_code and the JWT iat', async () => {
    const raw = fixtureText('plaid/sync_updates_available.json')
    const iat = now() - 10
    const v = await plaidAdapter.verify(raw, headers(await signer.sign(raw, { iat })), env)
    expect(plaidAdapter.eventKey(v!)).toBe(`item_fixture_1:SYNC_UPDATES_AVAILABLE:${iat}`)
  })

  it('keys LINK EVENTS by link session and code', async () => {
    const raw = fixtureText('plaid/link_events.json')
    const v = await plaidAdapter.verify(raw, headers(await signer.sign(raw)), env)
    expect(plaidAdapter.eventKey(v!)).toBe('ls_fixture_1:EVENTS')
  })

  it('rejects a request without a Plaid-Verification header', async () => {
    expect(await plaidAdapter.verify(success, new Headers(), env)).toBeNull()
  })

  it('is not configured when either Plaid secret is empty', () => {
    expect(plaidAdapter.configured(env)).toBe(true)
    expect(plaidAdapter.configured({ ...env, PLAID_CLIENT_ID: '' } as Env)).toBe(false)
    expect(plaidAdapter.configured({ ...env, PLAID_SECRET: '' } as Env)).toBe(false)
  })
})
