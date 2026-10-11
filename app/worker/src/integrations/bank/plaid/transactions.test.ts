import { afterEach, describe, expect, it } from 'vitest'
import { stubVendorFetch } from '../../../../test/helpers/vendor-fetch'
import { mapUpdateStatus, normalizeTransaction, syncTransactions, type PlaidTransaction } from './transactions'

const env = { PLAID_CLIENT_ID: 'id', PLAID_SECRET: 'secret', PLAID_ENV: 'sandbox' } as unknown as Env
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
const tx = (id: string, account = 'acc_1'): PlaidTransaction => ({ transaction_id: id, account_id: account, amount: 1.5, date: '2026-09-01' })
const page = (n: number, more: boolean, status = 'INITIAL_UPDATE_COMPLETE') => ({
  added: [tx(`t${n}a`), tx(`t${n}b`, 'acc_2')],
  modified: [],
  removed: n === 3 ? [{ transaction_id: 't1a' }] : [],
  accounts: [{ account_id: `acc_page${n}`, mask: '0000' }],
  has_more: more,
  next_cursor: `cur${n}`,
  transactions_update_status: status,
})
let stub: ReturnType<typeof stubVendorFetch> | undefined
afterEach(() => stub?.restore())

function pages(opts: { mutateOnce?: boolean } = {}) {
  let mutated = !opts.mutateOnce
  return stubVendorFetch([
    {
      host: 'sandbox.plaid.com',
      path: '/transactions/sync',
      respond: async (req) => {
        const { cursor } = (await req.json()) as { cursor: string | null }
        if (cursor === null) return json(page(1, true))
        if (cursor === 'cur1') {
          if (!mutated) {
            mutated = true
            return json({ error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' }, 400)
          }
          return json(page(2, true))
        }
        return json(page(3, false, 'HISTORICAL_UPDATE_COMPLETE'))
      },
    },
  ])
}

const bodies = async () => Promise.all(stub!.calls.map(async (c) => (await c.clone().json()) as Record<string, unknown>))

describe('plaid transactions sync', () => {
  it('pages until has_more is false with count 500, v2 categories and a cursor chain', async () => {
    stub = pages()
    const r = await syncTransactions(env, 'access', null)
    expect(r.added).toHaveLength(6)
    expect(r.removed).toEqual(['t1a'])
    expect(r.cursor).toBe('cur3')
    expect(r.status).toBe('historical')
    expect(r.statusRaw).toBe('HISTORICAL_UPDATE_COMPLETE')
    expect(r.accounts.map((a) => a.external_account_id)).toEqual(['acc_page3'])
    const sent = await bodies()
    expect(sent.map((b) => b.cursor)).toEqual([null, 'cur1', 'cur2'])
    for (const b of sent) expect(b).toMatchObject({ count: 500, options: { personal_finance_category_version: 'v2' } })
  })

  it('restarts from the original cursor on a mutation during pagination', async () => {
    stub = pages({ mutateOnce: true })
    const r = await syncTransactions(env, 'access', null)
    expect(r.added).toHaveLength(6)
    expect((await bodies()).map((b) => b.cursor)).toEqual([null, 'cur1', null, 'cur1', 'cur2'])
  })

  it('normalizeTransaction maps categories, null-safe authorized_date and pending', () => {
    const t = normalizeTransaction({
      ...tx('x'),
      personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_WAGES' },
      pending: true,
      merchant_name: 'Acme',
    })
    expect(t).toMatchObject({
      plaid_transaction_id: 'x',
      external_account_id: 'acc_1',
      category_primary: 'INCOME',
      category_detailed: 'INCOME_WAGES',
      authorized_date: null,
      pending: true,
      merchant_name: 'Acme',
    })
    expect(normalizeTransaction(tx('y')).pending).toBe(false)
  })

  it('mapUpdateStatus', () => {
    expect(mapUpdateStatus('NOT_READY')).toBe('not_ready')
    expect(mapUpdateStatus('INITIAL_UPDATE_COMPLETE')).toBe('initial')
    expect(mapUpdateStatus('HISTORICAL_UPDATE_COMPLETE')).toBe('historical')
    expect(mapUpdateStatus('SOMETHING_NEW')).toBe('not_ready')
  })

  it('429 is transient; ITEM_LOGIN_REQUIRED is permanent', async () => {
    stub = stubVendorFetch([{ host: 'sandbox.plaid.com', path: '/transactions/sync', respond: () => json({ error_code: 'RATE_LIMIT_EXCEEDED' }, 429) }])
    await expect(syncTransactions(env, 'a', null)).rejects.toMatchObject({ transient: true })
    stub.restore()
    stub = stubVendorFetch([{ host: 'sandbox.plaid.com', path: '/transactions/sync', respond: () => json({ error_code: 'ITEM_LOGIN_REQUIRED' }, 400) }])
    await expect(syncTransactions(env, 'a', null)).rejects.toMatchObject({ code: 'ITEM_LOGIN_REQUIRED', transient: false })
  })

  it('a first sync with nothing yet is not_ready', async () => {
    stub = stubVendorFetch([
      {
        host: 'sandbox.plaid.com',
        path: '/transactions/sync',
        respond: () => json({ added: [], modified: [], removed: [], has_more: false, next_cursor: 'c0', transactions_update_status: 'NOT_READY' }),
      },
    ])
    const r = await syncTransactions(env, 'a', null)
    expect(r).toMatchObject({ added: [], status: 'not_ready', cursor: 'c0', accounts: [] })
  })
})
