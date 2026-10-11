import { afterEach, describe, expect, it } from 'vitest'
import { stubVendorFetch } from '../../../../test/helpers/vendor-fetch'
import { downloadStatement, listStatements } from './statements'

const env = { PLAID_CLIENT_ID: 'id', PLAID_SECRET: 'secret', PLAID_ENV: 'sandbox' } as unknown as Env
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
const LIST = {
  accounts: [
    {
      account_id: 'acc_1',
      account_mask: '0000',
      account_name: 'Checking',
      account_type: 'depository',
      account_subtype: 'checking',
      statements: [{ statement_id: 's1', year: 2026, month: 9 }],
    },
  ],
}
let stub: ReturnType<typeof stubVendorFetch> | undefined
afterEach(() => stub?.restore())
const listStub = (respond: () => Response) =>
  stubVendorFetch([
    { host: 'sandbox.plaid.com', path: '/statements/list', respond },
    { host: 'sandbox.plaid.com', path: '/statements/refresh', respond: () => json({ request_id: 'r' }) },
  ])

describe('plaid statements', () => {
  it('lists accounts with their statements', async () => {
    stub = listStub(() => json(LIST))
    expect(await listStatements(env, 'a')).toEqual({
      supported: true,
      ready: true,
      accounts: [
        {
          external_account_id: 'acc_1',
          mask: '0000',
          name: 'Checking',
          official_name: null,
          type: 'depository',
          subtype: 'checking',
          statements: [{ id: 's1', year: 2026, month: 9 }],
        },
      ],
    })
  })

  it('PRODUCTS_NOT_SUPPORTED is supported: false', async () => {
    stub = listStub(() => json({ error_type: 'INVALID_REQUEST', error_code: 'PRODUCTS_NOT_SUPPORTED' }, 400))
    expect(await listStatements(env, 'a')).toEqual({ supported: false, ready: true, accounts: [] })
  })

  it('PRODUCT_NOT_READY is ready: false', async () => {
    stub = listStub(() => json({ error_code: 'PRODUCT_NOT_READY' }, 400))
    expect(await listStatements(env, 'a')).toEqual({ supported: true, ready: false, accounts: [] })
  })

  it('requestRefresh posts /statements/refresh before /statements/list', async () => {
    stub = listStub(() => json(LIST))
    await listStatements(env, 'a', { requestRefresh: { start: '2026-04-14', end: '2026-10-11' } })
    expect(stub.calls.map((c) => new URL(c.url).pathname)).toEqual(['/statements/refresh', '/statements/list'])
    expect(await stub.calls[0].json()).toEqual({ access_token: 'a', start_date: '2026-04-14', end_date: '2026-10-11' })
  })

  it('downloadStatement returns bytes and the Plaid-Content-Hash header (null when absent)', async () => {
    stub = stubVendorFetch([
      {
        host: 'sandbox.plaid.com',
        path: '/statements/download',
        respond: async (req) => {
          const { statement_id } = (await req.json()) as { statement_id: string }
          const headers = statement_id === 's1' ? { 'Plaid-Content-Hash': 'abc' } : undefined
          return new Response(new Uint8Array([37, 80, 68, 70]), { headers })
        },
      },
    ])
    const one = await downloadStatement(env, 'a', 's1')
    expect(new Uint8Array(one.bytes)).toEqual(new Uint8Array([37, 80, 68, 70]))
    expect(one.sha256).toBe('abc')
    expect((await downloadStatement(env, 'a', 's2')).sha256).toBeNull()
  })
})
