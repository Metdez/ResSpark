import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hmacKey, mintLinkToken, uuidToBytes } from '../src/auth/client-link'
import { createAdminClient } from '../src/db/client'
import { createClientLink } from '../src/db/client-links'
import { app } from '../src/index'
import { BUCKET, headBytes } from '../src/storage/case-documents'

// UPL-01/02 against the live project: mint → PUT bytes straight to Storage → complete.
// Run with `pnpm -C app run test:live:file worker/test/uploads.test.ts`.
//
// Fixtures live under a dedicated test firm. events is append-only and events.case_id has no
// ON DELETE, so the test firm, its fixed case and the events written here stay; they are never
// visible to ValorTax staff because every admin query is firm-scoped. Everything else (objects,
// documents, the request with its items, link and session) is removed in afterAll.
const { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY } = process.env
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const ready = SUPABASE_URL && SUPABASE_SECRET_KEY && CLIENT_LINK_HMAC_KEY && PUBLISHABLE

const FIRM = '00000000-0000-0000-0000-00000000000e'
const CASE = '00000000-0000-0000-0000-0000000000e1'

interface Minted {
  document_id: string
  path: string
  token: string
  signed_url: string
}

// A skipped run prints this title, which names the env it needs.
describe.skipIf(!ready)('client uploads (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY, a publishable key)', () => {
  const env = { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY } as unknown as Env
  let db: SupabaseClient
  let requestId = ''
  let itemId = ''
  let cookie = ''
  let jpeg: Minted

  const post = (path: string, body: unknown, header = true) => {
    const headers: Record<string, string> = { cookie, 'content-type': 'application/json' }
    if (header) headers['X-Requested-With'] = 'ResSpark'
    return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) }, env)
  }
  const put = (url: string, bytes: Uint8Array, mime: string) =>
    fetch(url, { method: 'PUT', headers: { 'content-type': mime, apikey: PUBLISHABLE! }, body: bytes })
  const fileOf = (size: number, magic: number[]) => {
    const bytes = new Uint8Array(size).fill(0x20)
    bytes.set(magic)
    return bytes
  }
  const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  const docRow = async (id: string) => (await db.from('documents').select('*').eq('id', id).single()).data!
  const uploadedEvents = async () =>
    (await db.from('events').select('id').eq('request_id', requestId).eq('action', 'document.uploaded')).data!.length

  beforeAll(async () => {
    db = createAdminClient(env)
    const now = new Date().toISOString()
    const firm = await db.from('firms').upsert({ id: FIRM, name: 'Test firm (automated)' }, { onConflict: 'id', ignoreDuplicates: true })
    expect(firm.error).toBeNull()
    const kase = await db
      .from('cases')
      .upsert({ id: CASE, firm_id: FIRM, first_name: 'Upload', last_name: 'Probe' }, { onConflict: 'id', ignoreDuplicates: true })
    expect(kase.error).toBeNull()
    const req = await db
      .from('requests')
      .insert({ firm_id: FIRM, case_id: CASE, template_name: 'test', status: 'opened', sent_at: now, opened_at: now })
      .select('id')
      .single()
    expect(req.error).toBeNull()
    requestId = req.data!.id
    const item = await db
      .from('request_items')
      .insert({ request_id: requestId, position: 1, kind: 'upload', label: 'ID', required: true, status: 'pending' })
      .select('id')
      .single()
    expect(item.error).toBeNull()
    itemId = item.data!.id

    const link = await createClientLink(env, { firm_id: FIRM, request_id: requestId })
    const token = await mintLinkToken(await hmacKey(CLIENT_LINK_HMAC_KEY!), uuidToBytes(link.id), link.version)
    const res = await app.request(`/c/${token}`, { redirect: 'manual' }, env)
    expect(res.status).toBe(302)
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
    expect(cookie).toMatch(/^rs_client=/)
  })

  afterAll(async () => {
    if (!db || !requestId) return
    const { data } = await db.from('documents').select('storage_key').eq('case_id', CASE)
    const keys = (data ?? []).map((d) => d.storage_key as string)
    if (keys.length) await db.storage.from(BUCKET).remove(keys)
    await db.from('documents').delete().eq('case_id', CASE)
    await db.from('requests').delete().eq('id', requestId) // cascades items, link, session
  })

  it('refuses a mint without X-Requested-With (403 bad_origin) and writes nothing', async () => {
    const res = await post(`/api/c/items/${itemId}/uploads`, { name: 'id.jpg', mime: 'image/jpeg', size: 1024 }, false)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('bad_origin')
    const { data } = await db.from('documents').select('id').eq('request_item_id', itemId)
    expect(data).toHaveLength(0)
  })

  it('mints a signed upload token and an uploading documents row', async () => {
    const res = await post(`/api/c/items/${itemId}/uploads`, { name: 'id.jpg', mime: 'image/jpeg', size: 1024 })
    expect(res.status).toBe(201)
    jpeg = (await res.json()) as Minted
    expect(jpeg.document_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(jpeg.token).toBeTruthy()
    expect(jpeg.signed_url).toContain('/storage/v1/object/upload/sign/')
    const row = await docRow(jpeg.document_id)
    expect(row.status).toBe('uploading')
    expect(row.storage_key).toBe(`firm/${FIRM}/case/${CASE}/item/${itemId}/${jpeg.document_id}/id.jpg`)
    const item = (await db.from('request_items').select('status').eq('id', itemId).single()).data!
    expect(item.status).toBe('in_progress')
  })

  it('PUTs bytes to Storage and completes: ready, submitted, waiting_on_staff, one event', async () => {
    const bytes = fileOf(1024, [0xff, 0xd8, 0xff, 0xe0])
    const up = await put(jpeg.signed_url, bytes, 'image/jpeg')
    expect(up.status).toBe(200)

    // headBytes relies on Storage honouring Range with a 206
    const signed = await db.storage.from(BUCKET).createSignedUrl(jpeg.path, 60)
    const range = await fetch(signed.data!.signedUrl, { headers: { range: 'bytes=0-15' } })
    expect(range.status).toBe(206)
    expect(range.headers.get('content-range')).toBe('bytes 0-15/1024')
    await range.body?.cancel()

    const res = await post(`/api/c/uploads/${jpeg.document_id}/complete`, { sha256: sha(bytes), size: 1024 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ document_status: 'ready', item_status: 'submitted', request_status: 'waiting_on_staff' })
    const row = await docRow(jpeg.document_id)
    expect(row).toMatchObject({ status: 'ready', size_bytes: 1024, sha256: sha(bytes) })
    expect((await db.from('request_items').select('status').eq('id', itemId).single()).data!.status).toBe('submitted')
    expect((await db.from('requests').select('status').eq('id', requestId).single()).data!.status).toBe('waiting_on_staff')
    expect(await uploadedEvents()).toBe(1)
  })

  it('a second complete is an idempotent no-op with no second event', async () => {
    const res = await post(`/api/c/uploads/${jpeg.document_id}/complete`, { sha256: 'a'.repeat(64), size: 1024 })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ document_status: 'ready', already: true })
    expect(await uploadedEvents()).toBe(1)
  })

  it('a magic-byte mismatch deletes the object and marks the row deleted (422 bad_file_type)', async () => {
    const mint = await post(`/api/c/items/${itemId}/uploads`, { name: 'fake.pdf', mime: 'application/pdf', size: 64 })
    expect(mint.status).toBe(201)
    const fake = (await mint.json()) as Minted
    const bytes = fileOf(64, [0xff, 0xd8, 0xff])
    expect((await put(fake.signed_url, bytes, 'application/pdf')).status).toBe(200)

    const res = await post(`/api/c/uploads/${fake.document_id}/complete`, { sha256: sha(bytes), size: 64 })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: { code: 'bad_file_type', message: 'That file is not a PDF or photo. Try again.' },
    })
    expect(await headBytes(env, fake.path)).toBeNull()
    expect((await docRow(fake.document_id)).status).toBe('deleted')
    expect(await uploadedEvents()).toBe(1)
  })
})
