import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdminClient } from '../src/db/client'
import { getEsignMapping, setEsignMapping } from '../src/db/esign-settings'
import { liveEnvOrSkip, TEST_FIRM_ID } from './fixtures/request'

// D-11 against the live project: the mapping merges into firms.settings without touching other keys
// and logs only the changed key names. Only the test firm is touched; its settings are restored.
// Run with `pnpm -C app run test:live:file worker/test/esign-settings-live.test.ts`.
const live = liveEnvOrSkip()

describe.skipIf(!live)('e-sign template mapping (live; needs SUPABASE_URL, SUPABASE_SECRET_KEY)', () => {
  const env = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY } as unknown as Env
  const db = () => createAdminClient(env)
  const ACTOR = 'esign-settings-live-test'
  let original: unknown = {}
  let lastEventId = 0

  beforeAll(async () => {
    await db().from('firms').upsert({ id: TEST_FIRM_ID, name: 'Test firm (automated)' }, { onConflict: 'id', ignoreDuplicates: true })
    original = (await db().from('firms').select('settings').eq('id', TEST_FIRM_ID).single()).data!.settings ?? {}
    await db().from('firms').update({ settings: { keep_me: 1 } }).eq('id', TEST_FIRM_ID)
    const last = (await db().from('events').select('id').order('id', { ascending: false }).limit(1)).data
    lastEventId = Number(last?.[0]?.id ?? 0)
  })

  afterAll(async () => {
    await db().from('firms').update({ settings: original }).eq('id', TEST_FIRM_ID)
  })

  it('merges the mapping, keeps other settings keys, and logs only the changed key names', async () => {
    const mapping = await setEsignMapping(env, TEST_FIRM_ID, { engagement_letter: 1001 }, ACTOR)
    expect(mapping).toEqual({ engagement_letter: 1001, form_2848: null, form_8821: null })

    const settings = (await db().from('firms').select('settings').eq('id', TEST_FIRM_ID).single()).data!.settings
    expect(settings.keep_me).toBe(1)

    const events = (
      await db()
        .from('events')
        .select('payload')
        .eq('firm_id', TEST_FIRM_ID)
        .eq('action', 'settings.esign_templates_updated')
        .gt('id', lastEventId)
    ).data!
    expect(events).toHaveLength(1)
    expect(events[0].payload).toEqual({ keys: ['engagement_letter'] })

    expect(await getEsignMapping(env, TEST_FIRM_ID)).toEqual(mapping)
  })
})
