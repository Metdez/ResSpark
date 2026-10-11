import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { insertConnection, saveSecret, setConnectionStatus, updateConnection } from '../src/db/connections'
import { listRemovalCandidates } from '../src/db/connections-ops'
import { sealToken } from '../src/integrations/token-vault'
import { queue, type Job } from '../src/jobs/index'
import { removeItem } from '../src/jobs/remove-items'
import { fixtureText, seedConnectionFixture, TEST_FIRM_ID, type ConnectionFixture } from './fixtures/connections'
import { stubVendorFetch } from './helpers/vendor-fetch'

// BANK-06 live proof: retention removal calls /item/remove with the unsealed token, deletes the
// secret, marks the connection removed, and keeps the client's data. Only Plaid is stubbed.
const { SUPABASE_URL, SUPABASE_SECRET_KEY, TOKEN_ENC_KEY_1 } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && TOKEN_ENC_KEY_1)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('remove items skipped: missing SUPABASE_URL, SUPABASE_SECRET_KEY or TOKEN_ENC_KEY_1')

const ITEM_IDS = ['item_fixture_0404_rm_a', 'item_fixture_0404_rm_b', 'item_fixture_0404_rm_c', 'item_fixture_0404_rm_d']

describe.skipIf(!live)('remove items (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, TOKEN_ENC_KEY_1)', () => {
  const env = { ...process.env, PLAID_CLIENT_ID: 'test', PLAID_SECRET: 'test', PLAID_ENV: 'sandbox', BANK_PROVIDER: 'plaid' } as unknown as Env
  let fx: ConnectionFixture
  let vendor: ReturnType<typeof stubVendorFetch>
  const gone = new Set<string>()
  const row = async (id: string) => (await fx.admin.from('connections').select('*').eq('id', id).single()).data!
  const secretCount = async (id: string) => (await fx.admin.from('connection_secrets').select('connection_id').eq('connection_id', id)).data!.length
  const conn = async (externalId: string, opts: { secret?: boolean; removeAfter?: string } = {}) => {
    const c = await insertConnection(env, {
      firm_id: fx.firm_id,
      request_id: fx.request_id,
      request_item_id: fx.item_id,
      case_id: fx.case_id,
      provider: 'plaid',
      kind: 'bank',
      external_id: externalId,
    })
    if (opts.secret !== false) await saveSecret(env, c.id, await sealToken(env, c.id, `access-${externalId}`))
    await setConnectionStatus(env, c.id, 'done')
    await updateConnection(env, c.id, { remove_after: opts.removeAfter ?? new Date(Date.now() - 1000).toISOString() })
    return c
  }

  beforeAll(async () => {
    fx = await seedConnectionFixture(env, { kind: 'bank' })
    await fx.admin.from('connections').delete().eq('firm_id', TEST_FIRM_ID).eq('provider', 'plaid').in('external_id', ITEM_IDS)
    vendor = stubVendorFetch([
      {
        host: 'sandbox.plaid.com',
        path: '/item/remove',
        respond: async (req) => {
          const { access_token } = (await req.json()) as { access_token: string }
          if (gone.has(access_token)) return Response.json({ error_code: 'ITEM_NOT_FOUND' }, { status: 400 })
          return new Response(fixtureText('plaid/item_remove.json'), { headers: { 'content-type': 'application/json' } })
        },
      },
    ])
  })

  afterAll(async () => {
    vendor?.restore()
    if (fx) await fx.cleanup()
  })

  it('removes a due Item, deletes the secret, keeps transactions and month cells', async () => {
    const c = await conn(ITEM_IDS[0])
    const acc = (await fx.admin.from('bank_accounts').insert({ connection_id: c.id, external_account_id: 'acc_rm', mask: '9999' }).select('id').single()).data!
    await fx.admin.from('bank_statement_months').insert({ bank_account_id: acc.id, year: 2026, month: 9, status: 'missing' })
    await fx.admin.from('bank_transactions').insert({ connection_id: c.id, bank_account_id: acc.id, plaid_transaction_id: `tx_0404_rm_${c.id}`, amount: 1, date: '2026-09-01' })
    expect(await listRemovalCandidates(env, 1000)).toContain(c.id)

    await removeItem(env, c.id)
    const call = vendor.calls.at(-1)!
    expect(new URL(call.url).pathname).toBe('/item/remove')
    expect(((await call.json()) as { access_token: string }).access_token).toBe(`access-${ITEM_IDS[0]}`)
    expect(await secretCount(c.id)).toBe(0)
    const r = await row(c.id)
    expect(r.status).toBe('removed')
    expect(r.removed_at).toBeTruthy()
    const removed = (await fx.admin.from('events').select('id').eq('request_id', fx.request_id).eq('action', 'connection.removed')).data!
    expect(removed).toHaveLength(1)
    expect((await fx.admin.from('bank_transactions').select('id').eq('connection_id', c.id)).data).toHaveLength(1)
    expect((await fx.admin.from('bank_statement_months').select('month').eq('bank_account_id', acc.id)).data).toHaveLength(1)
    expect(await listRemovalCandidates(env, 1000)).not.toContain(c.id)
  })

  it('remove_after exactly now is a candidate; no secret is never a candidate', async () => {
    const due = await conn(ITEM_IDS[1], { removeAfter: new Date().toISOString() })
    const bare = await conn(ITEM_IDS[2], { secret: false })
    const ids = await listRemovalCandidates(env, 1000)
    expect(ids).toContain(due.id)
    expect(ids).not.toContain(bare.id)
  })

  it('ITEM_NOT_FOUND from Plaid still counts as removed; the consumer acks remove_item', async () => {
    gone.add(`access-${ITEM_IDS[3]}`)
    const c = await conn(ITEM_IDS[3])
    const ack = vi.fn()
    const retry = vi.fn()
    const job: Job = { type: 'remove_item', ref: c.id }
    await queue({ queue: 'resspark-jobs', messages: [{ body: job, attempts: 1, ack, retry }] } as unknown as MessageBatch<Job>, env)
    expect(ack).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalled()
    expect((await row(c.id)).status).toBe('removed')
    expect(await secretCount(c.id)).toBe(0)
  })
})
