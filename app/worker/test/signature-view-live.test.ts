import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { insertConnection, recordConnectionEvent, setConnectionStatus } from '../src/db/connections'
import { listRequestSignatures, type SignatureView } from '../src/db/signature-view'
import { seedPortalItems, type PortalFixture } from './fixtures/portal-items'

// D-20 read model against the live project (test firm only): stage from the latest docuseal
// connection plus its last esign.viewed / esign.started event, the Test flag, configured, and no
// vendor slug or submission id in the view.
const { SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && CLIENT_LINK_HMAC_KEY)
// eslint-disable-next-line no-console -- the skip reason must be visible in the run output
if (!live) console.warn('signature view skipped: missing SUPABASE_URL, SUPABASE_SECRET_KEY or CLIENT_LINK_HMAC_KEY')

describe.skipIf(!live)('signature view (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY, CLIENT_LINK_HMAC_KEY)', () => {
  const env = { ...process.env, DOCUSEAL_API_KEY: '' } as unknown as Env
  const admin = live ? createAdminClient(env) : (undefined as unknown as ReturnType<typeof createAdminClient>)
  let fx: PortalFixture
  let item = ''
  let second = ''
  let connectionId = ''

  const view = async (id: string, e: Env = env) =>
    (await listRequestSignatures(e, fx.firmId, fx.requestId)).find((v) => v.item_id === id) as SignatureView
  const connect = (itemId: string, data: Record<string, unknown>) =>
    insertConnection(env, {
      firm_id: fx.firmId,
      request_id: fx.requestId,
      request_item_id: itemId,
      case_id: fx.caseId,
      provider: 'docuseal',
      kind: 'signature',
      link_ref: 'viewSlugNeverShown',
      data,
    })

  beforeAll(async () => {
    fx = await seedPortalItems(env, { kinds: ['signature'] })
    item = fx.items.signature!
    const row = await admin
      .from('request_items')
      .insert({ request_id: fx.requestId, position: 2, kind: 'signature', label: 'Sign your 8821', required: true, status: 'pending', config: { template: 'form_8821' } })
      .select('id')
      .single()
    second = (row.data as { id: string }).id
  })

  afterAll(async () => {
    if (fx) await fx.cleanup()
  })

  it('shows an item with no connection as not started, with its template key', async () => {
    const v = await view(item)
    expect(v).toEqual({ item_id: item, template_key: 'engagement_letter', configured: false, connection: null })
  })

  it('walks waiting -> viewed -> signing -> signed with the latest connection', async () => {
    connectionId = (await connect(item, { template_key: 'engagement_letter', env: 'test' })).id
    expect((await view(item)).connection).toMatchObject({ id: connectionId, status: 'pending', stage: 'waiting', env: 'test' })
    await recordConnectionEvent(env, connectionId, 'esign.viewed', {})
    expect((await view(item)).connection?.stage).toBe('viewed')
    await recordConnectionEvent(env, connectionId, 'esign.started', {})
    expect((await view(item)).connection?.stage).toBe('signing')
    await setConnectionStatus(env, connectionId, 'done')
    const done = (await view(item)).connection!
    expect(done.stage).toBe('signed')
    expect(done.completed_at).toEqual(expect.any(String))
  })

  it('reads a declined error on the second item and keeps the first item separate', async () => {
    const c = await connect(second, { template_key: 'form_8821', env: 'production' })
    await setConnectionStatus(env, c.id, 'error', { code: 'declined' })
    const v = await view(second)
    expect(v.template_key).toBe('form_8821')
    expect(v.connection).toMatchObject({ id: c.id, stage: 'declined', env: 'production', error_code: 'declined' })
    expect((await view(item)).connection?.stage).toBe('signed')
  })

  it('is configured only with a DocuSeal key and a mapped template', async () => {
    const firm = (await admin.from('firms').select('settings').eq('id', fx.firmId).single()).data as { settings: Record<string, unknown> | null }
    const saved = firm.settings ?? {}
    await admin
      .from('firms')
      .update({ settings: { ...saved, esign_templates: { engagement_letter: 1001, form_2848: null, form_8821: null } } })
      .eq('id', fx.firmId)
    try {
      const keyed = { ...env, DOCUSEAL_API_KEY: 'test-key' } as Env
      expect((await view(item, keyed)).configured).toBe(true)
      expect((await view(second, keyed)).configured).toBe(false)
      expect((await view(item)).configured).toBe(false)
    } finally {
      await admin.from('firms').update({ settings: saved }).eq('id', fx.firmId)
    }
  })

  it('never carries the signing slug, the vendor submission id, or an embed URL', async () => {
    const text = JSON.stringify(await listRequestSignatures(env, fx.firmId, fx.requestId))
    for (const key of ['link_ref', 'external_id', 'embed_src', 'viewSlugNeverShown']) expect(text).not.toContain(key)
  })
})
