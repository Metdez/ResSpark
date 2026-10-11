import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { targetMonths } from '../../src/lib/statement-months'
import { hmacKey, mintLinkToken, uuidToBytes } from '../src/auth/client-link'
import { insertConnection } from '../src/db/connections'
import { app } from '../src/index'
import { BUCKET } from '../src/storage/case-documents'
import { seedConnectionFixture, type ConnectionFixture } from './fixtures/connections'

// PAY-03 / BANK-03 gap closure, unmocked: a client uploads a statement PDF to a bank_connect item
// (mint → PUT to Storage → complete), then attributes it to one month, which reads `manual`.
// Run with `pnpm -C app run test:live:file worker/test/bank-manual-upload.test.ts`.
const { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY } = process.env
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && CLIENT_LINK_HMAC_KEY && PUBLISHABLE)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('bank manual upload skipped: missing SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY or a publishable key')

const PDF = readFileSync(fileURLToPath(new URL('./fixtures/files/tiny.pdf', import.meta.url).href))
const [MONTH] = targetMonths(new Date(), 6)

describe.skipIf(!live)('manual statement upload on a bank_connect item (live)', () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY } as unknown as Env
  let fx: ConnectionFixture
  let cookie = ''
  let connectionId = ''
  let accountId = ''
  let documentId = ''

  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'X-Requested-With': 'ResSpark' },
      body: JSON.stringify(body),
    }, env)

  beforeAll(async () => {
    fx = await seedConnectionFixture(env, { kind: 'bank' })
    const conn = await insertConnection(env, {
      firm_id: fx.firm_id,
      request_id: fx.request_id,
      request_item_id: fx.item_id,
      case_id: fx.case_id,
      provider: 'plaid',
      kind: 'bank',
    })
    connectionId = conn.id
    const account = await fx.admin
      .from('bank_accounts')
      .insert({ connection_id: conn.id, external_account_id: 'acc_manual_0407', mask: '0000', name: 'Checking' })
      .select('id')
      .single()
    accountId = account.data!.id as string
    const link = (await fx.admin.from('client_links').select('version').eq('id', fx.link_id).single()).data!
    const token = await mintLinkToken(await hmacKey(CLIENT_LINK_HMAC_KEY!), uuidToBytes(fx.link_id), link.version as number)
    const res = await app.request(`/c/${token}`, { redirect: 'manual' }, env)
    expect(res.status).toBe(302)
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  })

  afterAll(async () => {
    if (!fx) return
    // documents.request_item_id is ON DELETE SET NULL, so the files go first; the case stays.
    const docs = (await fx.admin.from('documents').select('storage_key').eq('request_item_id', fx.item_id)).data ?? []
    if (docs.length) await fx.admin.storage.from(BUCKET).remove(docs.map((d) => d.storage_key as string))
    await fx.admin.from('documents').delete().eq('request_item_id', fx.item_id)
    await fx.cleanup()
  })

  it('mints, uploads and completes a PDF on the bank_connect item', async () => {
    const mint = await post(`/api/c/items/${fx.item_id}/uploads`, { name: 'statement.pdf', mime: 'application/pdf', size: PDF.length })
    expect(mint.status).toBe(201)
    const minted = (await mint.json()) as { document_id: string; signed_url: string }
    documentId = minted.document_id
    const put = await fetch(minted.signed_url, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf', apikey: PUBLISHABLE! },
      body: PDF,
    })
    expect(put.status).toBe(200)
    const sha256 = createHash('sha256').update(PDF).digest('hex')
    const done = await post(`/api/c/uploads/${documentId}/complete`, { sha256, size: PDF.length })
    expect(done.status).toBe(200)
    expect(await done.json()).toMatchObject({ document_status: 'ready', item_status: 'submitted' })
  })

  it('attributes the upload to a month, which reads manual', async () => {
    const res = await post(`/api/c/connections/${connectionId}/statements/manual`, {
      document_id: documentId,
      bank_account_id: accountId,
      ...MONTH,
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'manual' })
    const cell = (
      await fx.admin
        .from('bank_statement_months')
        .select('status, document_id')
        .eq('bank_account_id', accountId)
        .eq('year', MONTH.year)
        .eq('month', MONTH.month)
        .single()
    ).data
    expect(cell).toEqual({ status: 'manual', document_id: documentId })
  })
})
