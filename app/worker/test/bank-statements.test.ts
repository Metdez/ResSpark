import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { targetMonths } from '../../src/lib/statement-months'
import { insertConnection, saveSecret, setConnectionStatus, updateConnection, type ConnectionRow } from '../src/db/connections'
import { sealToken } from '../src/integrations/token-vault'
import type { Job } from '../src/jobs/index'
import { reconcileConnection } from '../src/jobs/reconcile'
import { BUCKET } from '../src/storage/case-documents'
import { fixtureText, seedConnectionFixture, TEST_FIRM_ID, type ConnectionFixture } from './fixtures/connections'
import { stubVendorFetch } from './helpers/vendor-fetch'

// BANK-02/03 live proof: a connected Item with a sealed token -> /transactions/sync (3 pages, one
// MUTATION_DURING_PAGINATION restart) -> statements downloaded with the Plaid-Content-Hash check ->
// month cells -> refresh once -> not_supported -> done. Only Plaid is stubbed.
const { SUPABASE_URL, SUPABASE_SECRET_KEY, TOKEN_ENC_KEY_1 } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && TOKEN_ENC_KEY_1)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('bank statements skipped: missing SUPABASE_URL, SUPABASE_SECRET_KEY or TOKEN_ENC_KEY_1')

const ITEM_IDS = ['item_fixture_0404_stmt', 'item_fixture_0404_nosupp', 'item_fixture_0404_login']
const PDF = readFileSync(fileURLToPath(new URL('./fixtures/files/tiny.pdf', import.meta.url).href))
const PDF_SHA = createHash('sha256').update(PDF).digest('hex')
// Months pinned to the run's clock: the two newest window months have statements for acc_1.
const [M1, M2] = targetMonths(new Date(), 6)
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
const t = (id: string, account: string, date: string) => ({ transaction_id: id, account_id: account, amount: 12.5, date, name: id })
const ACCOUNTS = [
  { account_id: 'acc_1', mask: '0000', name: 'Checking', type: 'depository', subtype: 'checking' },
  { account_id: 'acc_2', mask: '1111', name: 'Savings', type: 'depository', subtype: 'savings' },
]
const SYNC_PAGES: Record<string, unknown> = {
  start: { added: [t('tx_0404_a', 'acc_1', '2026-09-02'), t('tx_0404_b', 'acc_1', '2026-09-02')], modified: [], removed: [], accounts: ACCOUNTS, has_more: true, next_cursor: 'c1', transactions_update_status: 'INITIAL_UPDATE_COMPLETE' },
  c1: { added: [t('tx_0404_c', 'acc_2', '2026-08-15')], modified: [], removed: [], accounts: ACCOUNTS, has_more: true, next_cursor: 'c2', transactions_update_status: 'INITIAL_UPDATE_COMPLETE' },
  c2: { added: [t('tx_0404_d', 'acc_1', '2026-07-01')], modified: [], removed: [{ transaction_id: 'tx_0404_b' }], accounts: ACCOUNTS, has_more: false, next_cursor: 'c3', transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE' },
  c3: { added: [], modified: [], removed: [], accounts: ACCOUNTS, has_more: false, next_cursor: 'c3', transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE' },
}
const listFor = (withStatements: boolean) => ({
  accounts: [
    { account_id: 'acc_1', account_mask: '0000', account_name: 'Checking', statements: withStatements ? [M1, M2].map((m, i) => ({ statement_id: `st_${i}`, ...m })) : [] },
    { account_id: 'acc_2', account_mask: '1111', account_name: 'Savings', statements: [] },
  ],
})

describe.skipIf(!live)('bank statements (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, TOKEN_ENC_KEY_1)', () => {
  const sent: Job[] = []
  const env = {
    ...process.env,
    PLAID_CLIENT_ID: 'test',
    PLAID_SECRET: 'test',
    PLAID_ENV: 'sandbox',
    BANK_PROVIDER: 'plaid',
    JOBS: { send: async (job: Job) => void sent.push(job) },
  } as unknown as Env
  let fx: ConnectionFixture
  let conn: ConnectionRow
  let vendor: ReturnType<typeof stubVendorFetch>
  let mutated = false
  let listMode: 'statements' | 'unsupported' = 'statements'
  const paths = () => vendor.calls.map((c) => new URL(c.url).pathname)
  const row = async (id: string) => (await fx.admin.from('connections').select('*').eq('id', id).single()).data!
  const accounts = async (id: string) => (await fx.admin.from('bank_accounts').select('id, external_account_id').eq('connection_id', id)).data!
  const cells = async (accountId: string) =>
    (await fx.admin.from('bank_statement_months').select('year, month, status, document_id').eq('bank_account_id', accountId)).data!
  const connected = async (externalId: string) => {
    const c = await insertConnection(env, {
      firm_id: fx.firm_id,
      request_id: fx.request_id,
      request_item_id: fx.item_id,
      case_id: fx.case_id,
      provider: 'plaid',
      kind: 'bank',
      external_id: externalId,
    })
    await saveSecret(env, c.id, await sealToken(env, c.id, `access-${externalId}`))
    await setConnectionStatus(env, c.id, 'connected')
    return c
  }

  beforeAll(async () => {
    fx = await seedConnectionFixture(env, { kind: 'bank' })
    await fx.admin.from('connections').delete().eq('firm_id', TEST_FIRM_ID).eq('provider', 'plaid').in('external_id', ITEM_IDS)
    await fx.admin.from('bank_transactions').delete().like('plaid_transaction_id', 'tx_0404_%')
    vendor = stubVendorFetch([
      {
        host: 'sandbox.plaid.com',
        path: '/transactions/sync',
        respond: async (req) => {
          const { cursor } = (await req.json()) as { cursor: string | null }
          if (cursor === 'c1' && !mutated) {
            mutated = true
            return json({ error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' }, 400)
          }
          return json(SYNC_PAGES[cursor ?? 'start'])
        },
      },
      {
        host: 'sandbox.plaid.com',
        path: '/statements/list',
        respond: () =>
          listMode === 'unsupported' ? json({ error_type: 'INVALID_REQUEST', error_code: 'PRODUCTS_NOT_SUPPORTED' }, 400) : json(listFor(true)),
      },
      { host: 'sandbox.plaid.com', path: '/statements/download', respond: () => new Response(PDF, { headers: { 'Plaid-Content-Hash': PDF_SHA } }) },
      { host: 'sandbox.plaid.com', path: '/statements/refresh', respond: () => json({ request_id: 'req_refresh' }) },
      { host: 'sandbox.plaid.com', path: '/accounts/get', respond: () => json({ accounts: [] }) },
    ])
    conn = await connected(ITEM_IDS[0])
  })

  afterAll(async () => {
    vendor?.restore()
    if (!fx) return
    const docs = (await fx.admin.from('documents').select('id, storage_key').eq('request_item_id', fx.item_id)).data ?? []
    if (docs.length) await fx.admin.storage.from(BUCKET).remove(docs.map((d) => d.storage_key as string))
    await fx.admin.from('documents').delete().eq('request_item_id', fx.item_id)
    await fx.cleanup() // accounts, cells, transactions and secrets cascade with connections
  })

  it('first reconcile: sync with a mutation restart, statements stored with hash check, cells, one refresh', async () => {
    const r = await reconcileConnection(env, conn.id, { source: 'cron' })
    expect(r.status).toBe('syncing')
    const syncCursors = await Promise.all(
      vendor.calls.filter((c) => c.url.endsWith('/transactions/sync')).map(async (c) => ((await c.clone().json()) as { cursor: unknown }).cursor)
    )
    expect(syncCursors).toEqual([null, 'c1', null, 'c1', 'c2'])

    expect(await accounts(conn.id)).toHaveLength(2)
    const txns = (await fx.admin.from('bank_transactions').select('plaid_transaction_id, date').eq('connection_id', conn.id)
      .order('date', { ascending: false }).order('plaid_transaction_id', { ascending: true })).data!
    expect(txns.map((x) => x.plaid_transaction_id)).toEqual(['tx_0404_a', 'tx_0404_c', 'tx_0404_d'])
    const after = await row(conn.id)
    expect(after.sync_cursor).toBe('c3')
    expect(after.data.transactions_update_status).toBe('HISTORICAL_UPDATE_COMPLETE')
    expect(after.data.statements_refresh_requested_at).toBeTruthy()

    const ids = Object.fromEntries((await accounts(conn.id)).map((a) => [a.external_account_id, a.id]))
    const acc1 = await cells(ids.acc_1)
    expect(acc1.filter((c) => c.status === 'available' && c.document_id)).toHaveLength(2)
    expect(acc1.filter((c) => c.status === 'missing')).toHaveLength(4)
    expect((await cells(ids.acc_2)).map((c) => c.status)).toEqual(Array(6).fill('pending'))

    const docs = (await fx.admin.from('documents').select('*').eq('connection_id', conn.id)).data!
    expect(docs).toHaveLength(2)
    for (const d of docs) {
      expect(d).toMatchObject({ document_type: 'bank_statement', sha256: PDF_SHA, uploaded_by_actor: 'provider:plaid' })
      expect(d.storage_key).toMatch(/\/bank\/0000\/\d{4}-\d{2}\.pdf$/)
    }
    expect(paths().filter((p) => p === '/statements/refresh')).toHaveLength(1)
  })

  // Quick 261018-kgl (H): done also generates a transaction-statement PDF for every window month the bank
  // could not provide that has transactions: acc_2 August (not_supported) and acc_1 July (missing).
  it('second reconcile: still nothing for acc_2 -> not_supported, done, generated transaction PDFs, no new downloads or refresh', { timeout: 30_000 }, async () => {
    const downloads = paths().filter((p) => p === '/statements/download').length
    const r = await reconcileConnection(env, conn.id, { source: 'cron' })
    expect(r.status).toBe('done')
    const ids = Object.fromEntries((await accounts(conn.id)).map((a) => [a.external_account_id, a.id]))
    const acc2 = await cells(ids.acc_2)
    expect(acc2.map((c) => c.status)).toEqual(Array(6).fill('not_supported'))
    expect(acc2.filter((c) => c.document_id)).toHaveLength(1)
    expect((await cells(ids.acc_1)).filter((c) => c.status === 'missing' && c.document_id)).toHaveLength(1)
    expect(paths().filter((p) => p === '/statements/download')).toHaveLength(downloads)
    expect(paths().filter((p) => p === '/statements/refresh')).toHaveLength(1)
    const docs = (await fx.admin.from('documents').select('document_type, original_filename, uploaded_by_actor').eq('connection_id', conn.id)).data!
    expect(docs.filter((d) => d.document_type === 'bank_statement')).toHaveLength(2)
    const generated = docs.filter((d) => d.document_type === 'bank_transactions')
    expect(generated.map((d) => d.original_filename).sort()).toEqual(['Transactions - August 2026 - x1111.pdf', 'Transactions - July 2026 - x0000.pdf'])
    expect(generated.every((d) => d.uploaded_by_actor === 'provider:resspark')).toBe(true)
    expect((await fx.admin.from('request_items').select('status').eq('id', fx.item_id).single()).data!.status).toBe('approved')
  })

  it('SYNC_UPDATES_AVAILABLE syncs from the stored cursor without statements calls', async () => {
    const before = vendor.calls.length
    await reconcileConnection(env, conn.id, { source: 'webhook', hint: JSON.parse(fixtureText('plaid/sync_updates_available.json')) })
    const calls = vendor.calls.slice(before)
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/transactions/sync', '/accounts/get'])
    expect(((await calls[0].json()) as { cursor: string }).cursor).toBe('c3')
  })

  // connection_set_status only moves forward by rank, so a done connection keeps done; use a fresh one.
  it('ITEM_LOGIN_REQUIRED as a hint marks the connection error with no vendor call', async () => {
    const c = await connected(ITEM_IDS[2])
    const before = vendor.calls.length
    const r = await reconcileConnection(env, c.id, { source: 'webhook', hint: JSON.parse(fixtureText('plaid/item_error.json')) })
    expect(r.status).toBe('error')
    expect((await row(c.id)).error.code).toBe('ITEM_LOGIN_REQUIRED')
    expect(vendor.calls.length).toBe(before)
  })

  it('PRODUCTS_NOT_SUPPORTED marks every cell not_supported and the connection still reaches done', async () => {
    listMode = 'unsupported'
    const c = await connected(ITEM_IDS[1])
    await updateConnection(env, c.id, { sync_cursor: 'c2' })
    // the account exists with pending cells from an earlier run's sync
    const acc = (await fx.admin.from('bank_accounts').insert({ connection_id: c.id, external_account_id: 'acc_x', mask: '2222' }).select('id').single()).data!
    await fx.admin.from('bank_statement_months').insert(targetMonths(new Date(), 6).map((m) => ({ bank_account_id: acc.id, ...m, status: 'pending' })))
    const r = await reconcileConnection(env, c.id, { source: 'cron' })
    expect(r.status).toBe('done')
    const all = (await fx.admin.from('bank_accounts').select('id').eq('connection_id', c.id)).data!
    for (const a of all) for (const cell of await cells(a.id)) expect(cell.status).toBe('not_supported')
  })
})
