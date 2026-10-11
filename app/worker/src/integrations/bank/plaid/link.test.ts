import { afterEach, describe, expect, it } from 'vitest'
import { stubVendorFetch } from '../../../../test/helpers/vendor-fetch'
import { ProviderError } from '../../provider-error'
import { completeSession, createLinkSession, linkTokenBody, statementsWindow } from './link'

const env = { PLAID_CLIENT_ID: 'id', PLAID_SECRET: 'secret', PLAID_ENV: 'sandbox' } as unknown as Env
const P = {
  connectionId: 'C1',
  requestId: 'R1',
  firmName: 'Firm',
  webhookUrl: 'https://x.test/api/webhooks/plaid',
  returnUrl: 'https://x.test/c/return?nonce=n',
  statementsStart: '2026-04-14',
  statementsEnd: '2026-10-11',
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
let stub: ReturnType<typeof stubVendorFetch> | undefined
afterEach(() => stub?.restore())

describe('plaid link', () => {
  it('linkTokenBody carries exactly the D-08 fields', () => {
    expect(linkTokenBody(P)).toEqual({
      user: { client_user_id: 'R1' },
      client_name: 'Firm',
      country_codes: ['US'],
      language: 'en',
      webhook: P.webhookUrl,
      products: ['transactions'],
      transactions: { days_requested: 365 },
      required_if_supported_products: ['statements'],
      statements: { start_date: '2026-04-14', end_date: '2026-10-11' },
      hosted_link: { completion_redirect_uri: P.returnUrl, url_lifetime_seconds: 1800, is_mobile_app: false },
    })
  })

  it('statementsWindow spans 180 days ending today', () => {
    expect(statementsWindow(new Date('2026-10-11T12:00:00Z'))).toEqual({ start_date: '2026-04-14', end_date: '2026-10-11' })
  })

  it('createLinkSession returns the hosted link url; a missing url is no_hosted_link_url', async () => {
    stub = stubVendorFetch([
      {
        host: 'sandbox.plaid.com',
        path: '/link/token/create',
        respond: () => json({ link_token: 'lt', hosted_link_url: 'https://h', expiration: 'e' }),
      },
    ])
    expect(await createLinkSession(env, P)).toEqual({ linkRef: 'lt', url: 'https://h', expiresAt: 'e' })
    expect(stub.calls[0].headers.get('PLAID-CLIENT-ID')).toBe('id')
    stub.restore()
    stub = stubVendorFetch([
      { host: 'sandbox.plaid.com', path: '/link/token/create', respond: () => json({ link_token: 'lt', expiration: 'e' }) },
    ])
    await expect(createLinkSession(env, P)).rejects.toMatchObject({ code: 'no_hosted_link_url' })
  })

  it('completeSession with webhook tokens exchanges them without /link/token/get', async () => {
    stub = stubVendorFetch([
      { host: 'sandbox.plaid.com', path: '/item/public_token/exchange', respond: () => json({ access_token: 'a1', item_id: 'i1' }) },
    ])
    expect(await completeSession(env, { linkRef: 'lt', publicTokens: ['p1'] })).toEqual([
      { accessToken: 'a1', externalId: 'i1', institutionName: null },
    ])
    expect(stub.calls.map((c) => new URL(c.url).pathname)).toEqual(['/item/public_token/exchange'])
  })

  it('completeSession without tokens recovers them from /link/token/get', async () => {
    const got = { link_sessions: [{ results: { item_add_results: [{ public_token: 'p2', institution: { name: 'Bank' } }] } }] }
    stub = stubVendorFetch([
      { host: 'sandbox.plaid.com', path: '/link/token/get', respond: () => json(got) },
      { host: 'sandbox.plaid.com', path: '/item/public_token/exchange', respond: () => json({ access_token: 'a2', item_id: 'i2' }) },
    ])
    expect(await completeSession(env, { linkRef: 'lt' })).toEqual([{ accessToken: 'a2', externalId: 'i2', institutionName: 'Bank' }])
  })

  it('maps Plaid errors: 429 transient, ITEM_LOGIN_REQUIRED permanent', async () => {
    stub = stubVendorFetch([
      { host: 'sandbox.plaid.com', path: '/link/token/get', respond: () => json({ error_code: 'RATE_LIMIT_EXCEEDED' }, 429) },
    ])
    const e1 = await completeSession(env, { linkRef: 'lt' }).catch((e: unknown) => e)
    expect(e1).toBeInstanceOf(ProviderError)
    expect(e1).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED', transient: true })
    stub.restore()
    stub = stubVendorFetch([
      { host: 'sandbox.plaid.com', path: '/link/token/get', respond: () => json({ error_code: 'ITEM_LOGIN_REQUIRED' }, 400) },
    ])
    await expect(completeSession(env, { linkRef: 'lt' })).rejects.toMatchObject({ code: 'ITEM_LOGIN_REQUIRED', transient: false })
  })
})
