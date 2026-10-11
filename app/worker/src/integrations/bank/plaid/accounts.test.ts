import { afterEach, describe, expect, it } from 'vitest'
import { fixtureText } from '../../../../test/fixtures/connections'
import { stubVendorFetch } from '../../../../test/helpers/vendor-fetch'
import { ProviderError } from '../../provider-error'
import { getAccountBalances } from './accounts'

const env = { PLAID_CLIENT_ID: 'id', PLAID_SECRET: 'secret', PLAID_ENV: 'sandbox' } as unknown as Env
let stub: ReturnType<typeof stubVendorFetch> | undefined
afterEach(() => stub?.restore())

describe('plaid /accounts/get', () => {
  it('posts the access token and maps balances', async () => {
    stub = stubVendorFetch([
      { host: 'sandbox.plaid.com', path: '/accounts/get', respond: () => new Response(fixtureText('plaid/accounts_get.json')) },
    ])
    const out = await getAccountBalances(env, 'access-1')
    expect(await stub.calls[0].json()).toEqual({ access_token: 'access-1' })
    expect(out[0]).toMatchObject({ external_account_id: 'acc_checking', current: 1250.75, available: 1100.5 })
    expect(out[0].as_of).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(out[1]).toEqual({ external_account_id: 'acc_credit', current: 410, available: null, as_of: '2026-10-10T08:00:00Z' })
  })

  it('a 429 is a transient ProviderError', async () => {
    stub = stubVendorFetch([
      {
        host: 'sandbox.plaid.com',
        path: '/accounts/get',
        respond: () => new Response(JSON.stringify({ error_code: 'RATE_LIMIT_EXCEEDED' }), { status: 429 }),
      },
    ])
    const e = await getAccountBalances(env, 'access-1').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ProviderError)
    expect(e).toMatchObject({ transient: true, code: 'RATE_LIMIT_EXCEEDED' })
  })

  it('a malformed body is a permanent bad_response', async () => {
    stub = stubVendorFetch([{ host: 'sandbox.plaid.com', path: '/accounts/get', respond: () => new Response('{"accounts":"x"}') }])
    await expect(getAccountBalances(env, 'access-1')).rejects.toMatchObject({ code: 'bad_response', transient: false })
  })
})
