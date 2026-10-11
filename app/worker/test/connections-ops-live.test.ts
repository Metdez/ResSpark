import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { targetMonths } from '../../src/lib/statement-months'
import { insertConnection, type ConnectionRow } from '../src/db/connections'
import {
  expireStalePendingBank,
  firmOwnsRequest,
  getFirmConnection,
  listConnectionTransactions,
  listRemovalCandidates,
  listRequestConnections,
  listStaleConnections,
  windowStart,
} from '../src/db/connections-ops'
import { seedConnectionFixture, type ConnectionFixture } from './fixtures/connections'

// The cron queries against the live project (test firm ...000e). Other suites may own rows that
// also match, so every assertion is about this suite's own ids (contain / not contain / order).
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('connections-ops live suite skipped: missing SUPABASE_URL or SUPABASE_SECRET_KEY')

const MIN = 60_000
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

describe.skipIf(!live)('connections-ops cron queries (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY)', () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY } as unknown as Env
  let fx: ConnectionFixture
  const id: Record<string, string> = {}

  const add = async (
    name: string,
    over: Partial<ConnectionRow> & { provider?: ConnectionRow['provider']; kind?: ConnectionRow['kind'] },
    secret = false
  ) => {
    const row = await insertConnection(env, {
      firm_id: fx.firm_id,
      request_id: fx.request_id,
      request_item_id: fx.item_id,
      case_id: fx.case_id,
      provider: over.provider ?? 'plaid',
      kind: over.kind ?? 'bank',
    })
    const { provider: _p, kind: _k, ...patch } = over
    if (Object.keys(patch).length) {
      const { error } = await fx.admin.from('connections').update(patch).eq('id', row.id)
      if (error) throw new Error(error.message)
    }
    if (secret) {
      const { error } = await fx.admin.from('connection_secrets').insert({ connection_id: row.id, ciphertext: 'x', iv: 'y' })
      if (error) throw new Error(error.message)
    }
    id[name] = row.id
  }

  beforeAll(async () => {
    fx = await seedConnectionFixture(env, { kind: 'bank' })
    // stale: polled 20 min ago, no webhook
    await add('stalePolled', { status: 'connected', created_at: at(-60 * MIN), last_polled_at: at(-20 * MIN) }, true)
    // fresh: polled 2 min ago
    await add('freshPolled', { status: 'connected', created_at: at(-60 * MIN), last_polled_at: at(-2 * MIN) }, true)
    // fresh: a webhook 2 min ago beats an old poll
    await add('freshWebhook', {
      status: 'syncing',
      created_at: at(-60 * MIN),
      last_polled_at: at(-20 * MIN),
      last_webhook_at: at(-2 * MIN),
    }, true)
    await add('tooOld', { status: 'connected', created_at: at(-20 * 24 * 60 * MIN) }, true)
    await add('terminal', { status: 'done', created_at: at(-60 * MIN) }, true)
    // pending-link expiry
    await add('deadLink', { created_at: at(-7 * 60 * MIN) })
    await add('liveLink', { created_at: at(-60 * MIN) })
    await add('pendingWithToken', { created_at: at(-7 * 60 * MIN) }, true)
    // removal candidates
    await add('dueOlder', { status: 'done', remove_after: at(-2 * 24 * 60 * MIN) }, true)
    await add('dueNow', { status: 'done', remove_after: at(-1000) }, true)
    await add('notDue', { status: 'done', remove_after: at(60 * MIN) }, true)
    await add('dueNoSecret', { status: 'done', remove_after: at(-60 * MIN) })
    await add('dueRemoved', { status: 'removed', remove_after: at(-60 * MIN), removed_at: at(-MIN) }, true)
    await add('dueTruv', { provider: 'truv', kind: 'payroll', status: 'done', remove_after: at(-60 * MIN) }, true)
  }, 60_000)

  afterAll(async () => fx?.cleanup())

  it('listStaleConnections picks connections with no webhook or poll for 10 minutes, younger than 14 days', async () => {
    const stale = await listStaleConnections(env, 10, 1000)
    expect(stale).toContain(id.stalePolled)
    expect(stale).toContain(id.liveLink) // pending, never polled, created an hour ago
    for (const n of ['freshPolled', 'freshWebhook', 'tooOld', 'terminal']) expect(stale, n).not.toContain(id[n])
  })

  it('expireStalePendingBank picks pending bank links older than 6 h that never got a token', async () => {
    const expired = await expireStalePendingBank(env, 6)
    expect(expired).toContain(id.deadLink)
    for (const n of ['liveLink', 'pendingWithToken', 'stalePolled']) expect(expired).not.toContain(id[n])
  })

  it('listRemovalCandidates: Plaid, due, not removed, holding a secret, oldest first', async () => {
    const due = await listRemovalCandidates(env, 1000)
    expect(due).toContain(id.dueOlder)
    expect(due).toContain(id.dueNow)
    expect(due.indexOf(id.dueOlder)).toBeLessThan(due.indexOf(id.dueNow))
    for (const n of ['notDue', 'dueNoSecret', 'dueRemoved', 'dueTruv']) expect(due).not.toContain(id[n])
  })
})

describe.skipIf(!live)('connections-ops staff read model (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY)', () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY } as unknown as Env
  const OTHER_FIRM = '00000000-0000-0000-0000-000000000001'
  let fx: ConnectionFixture
  let older = ''
  let newer = ''
  const now = new Date()
  const isoDay = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10)
  const must = async <T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
    const { data, error } = await p
    if (error || data === null) throw new Error(error?.message ?? 'no data')
    return data
  }

  beforeAll(async () => {
    fx = await seedConnectionFixture(env, { kind: 'bank' })
    const conn = async () =>
      (
        await insertConnection(env, {
          firm_id: fx.firm_id,
          request_id: fx.request_id,
          request_item_id: fx.item_id,
          case_id: fx.case_id,
          provider: 'plaid',
          kind: 'bank',
        })
      ).id
    older = await conn()
    newer = await conn()
    await must(fx.admin.from('connections').update({ created_at: at(-60 * MIN) }).eq('id', older).select('id'))
    await must(
      fx.admin
        .from('connections')
        .update({ data: { transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE' } })
        .eq('id', newer)
        .select('id')
    )
    const accounts = (await must(
      fx.admin
        .from('bank_accounts')
        .insert([
          { connection_id: newer, external_account_id: 'acc_b', mask: '2222', name: 'Savings' },
          { connection_id: newer, external_account_id: 'acc_a', mask: '1111', name: 'Checking' },
        ])
        .select('id, external_account_id')
    )) as Array<{ id: string; external_account_id: string }>
    const a = accounts.find((x) => x.external_account_id === 'acc_a')!
    const b = accounts.find((x) => x.external_account_id === 'acc_b')!
    const [prev] = targetMonths(now)
    await must(fx.admin.from('bank_statement_months').insert({ bank_account_id: a.id, year: prev.year, month: prev.month, status: 'not_supported' }).select('year'))
    const tx = (pid: string, daysAgo: number, account = a.id) => ({
      connection_id: newer,
      bank_account_id: account,
      plaid_transaction_id: `${newer}-${pid}`,
      amount: 12.5,
      date: isoDay(daysAgo),
      name: pid,
    })
    await must(
      fx.admin
        .from('bank_transactions')
        .insert([tx('t2', 5), tx('t1', 5, b.id), tx('t3', 40), tx('t4', 400)])
        .select('id')
    )
  }, 60_000)

  afterAll(async () => fx?.cleanup())

  it('firmOwnsRequest and getFirmConnection are firm-scoped', async () => {
    expect(await firmOwnsRequest(env, fx.firm_id, fx.request_id)).toBe(true)
    expect(await firmOwnsRequest(env, OTHER_FIRM, fx.request_id)).toBe(false)
    expect((await getFirmConnection(env, fx.firm_id, newer))?.id).toBe(newer)
    expect(await getFirmConnection(env, OTHER_FIRM, newer)).toBeNull()
  })

  it('listRequestConnections: newest first, month grid, account order, transaction state', async () => {
    const list = await listRequestConnections(env, fx.firm_id, fx.request_id)
    expect(list.map((s) => s.id)).toEqual([newer, older])
    const [s] = list
    expect(s.accounts.map((acc) => acc.mask)).toEqual(['1111', '2222'])
    expect(s.accounts[0].months).toHaveLength(6)
    expect(s.accounts[0].months[0].status).toBe('not_supported')
    expect(s.accounts[1].months.every((m) => m.status === 'missing')).toBe(true)
    expect(s.transactions).toEqual({ count: 4, update_status: 'historical' })
    expect(s.capabilities?.statementPdfs).toBe(true)
    expect(await listRequestConnections(env, OTHER_FIRM, fx.request_id)).toEqual([])
  })

  it('listConnectionTransactions: window, date DESC then plaid id, total, firm scope', async () => {
    const three = (await listConnectionTransactions(env, fx.firm_id, newer, 3, 1000, now))!
    // t1 and t2 share a date: plaid_transaction_id breaks the tie. t4 (400 days ago) is outside.
    expect(three.rows.map((r) => r.name)).toEqual(['t1', 't2', 't3'])
    expect(three.total).toBe(3)
    expect(three.rows.every((r) => r.date >= windowStart(now, 3) && typeof r.amount === 'number')).toBe(true)
    expect(await listConnectionTransactions(env, OTHER_FIRM, newer, 6)).toBeNull()
  })
})
