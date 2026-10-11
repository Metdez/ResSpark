import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdminClient } from '../src/db/client'

// The request lifecycle RPCs of migration 0003 against the live project.
// Run with `pnpm -C app run test:requests` (or `test:live`).
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const FIRM = '00000000-0000-0000-0000-000000000001'
const OTHER_FIRM = '00000000-0000-0000-0000-0000000000ff'
const LOGICS_ID = 999999001
const DAY = 86_400_000

interface Link {
  link_id: string
  version: number
  expires_at: string
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_SECRET_KEY)('request lifecycle RPCs (live)', () => {
  let db: SupabaseClient
  let caseId = ''
  let requestId = ''
  let link: Link
  let openedAt = ''

  const confirm = () =>
    db.rpc('case_confirm_logics', {
      p_firm_id: FIRM,
      p_logics_case_id: LOGICS_ID,
      p_first_name: 'Live',
      p_last_name: 'Probe',
      p_email: 'live.probe@example.com',
      p_phone_e164: '+15550109999',
      p_snapshot: { source: 'test' },
      p_actor_id: null,
      p_search_type: 'phone',
    })
  const send = (firmId = FIRM) =>
    db.rpc('request_send', {
      p_request_id: requestId,
      p_firm_id: firmId,
      p_actor_id: null,
      p_contact_email: 'live.probe@example.com',
      p_contact_phone_e164: '+15550109999',
    })
  const open = () => db.rpc('request_open', { p_link_id: link.link_id })
  const regenerate = () =>
    db.rpc('request_regenerate_link', { p_request_id: requestId, p_firm_id: FIRM, p_actor_id: null })
  const revoke = () =>
    db.rpc('request_revoke', { p_request_id: requestId, p_firm_id: FIRM, p_actor_id: null })
  const countEvents = async (action: string, column: 'case_id' | 'request_id', id: string) => {
    const { data, error } = await db.from('events').select('id').eq('action', action).eq(column, id)
    expect(error).toBeNull()
    return data!.length
  }
  const request = async () => {
    const { data, error } = await db.from('requests').select('*').eq('id', requestId).single()
    expect(error).toBeNull()
    return data!
  }
  const linkRow = async () => {
    const { data, error } = await db.from('client_links').select('*').eq('id', link.link_id).single()
    expect(error).toBeNull()
    return data!
  }

  beforeAll(() => {
    db = createAdminClient({ SUPABASE_URL: SUPABASE_URL!, SUPABASE_SECRET_KEY: SUPABASE_SECRET_KEY! })
  })

  // events.case_id has no ON DELETE and events is append-only, so the probe case
  // can never be deleted; it is a fixed fixture and only its requests go
  // (cascading items, link, session).
  afterAll(async () => {
    if (caseId) await db.from('requests').delete().eq('case_id', caseId)
  })

  it('case_confirm_logics upserts on (firm, logics id) and logs case.looked_up per call', async () => {
    const first = await confirm()
    const second = await confirm()
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    expect(typeof first.data).toBe('string')
    expect(second.data).toBe(first.data)
    caseId = first.data as string
    expect(await countEvents('case.looked_up', 'case_id', caseId)).toBeGreaterThanOrEqual(2)
  })

  it("request_create raises 'no_items' for an empty array and inserts nothing", async () => {
    const before = await db.from('requests').select('id').eq('case_id', caseId)
    const { error } = await db.rpc('request_create', {
      p_firm_id: FIRM,
      p_case_id: caseId,
      p_template_name: 'Documents only',
      p_items: [],
      p_created_by: null,
      p_agent_display_name: 'Live Probe',
    })
    expect(error?.message).toContain('no_items')
    const after = await db.from('requests').select('id').eq('case_id', caseId)
    expect(after.data!.length).toBe(before.data!.length)
  })

  it("request_create raises 'case_not_found' for another firm's case", async () => {
    const { error } = await db.rpc('request_create', {
      p_firm_id: OTHER_FIRM,
      p_case_id: caseId,
      p_template_name: 'Documents only',
      p_items: [{ kind: 'upload', label: 'A', required: true, config: {} }],
      p_created_by: null,
      p_agent_display_name: 'Live Probe',
    })
    expect(error?.message).toContain('case_not_found')
  })

  it('request_create numbers positions 1..N and allows a repeated label', async () => {
    const { data, error } = await db.rpc('request_create', {
      p_firm_id: FIRM,
      p_case_id: caseId,
      p_template_name: 'Documents only',
      p_items: [
        { kind: 'upload', label: 'A', required: true, config: {} },
        { kind: 'upload', label: 'A', required: false, config: {} },
      ],
      p_created_by: null,
      p_agent_display_name: 'Live Probe',
    })
    expect(error).toBeNull()
    requestId = data as string
    const items = await db
      .from('request_items')
      .select('position, label, required')
      .eq('request_id', requestId)
      .order('position')
    expect(items.data!.map((i) => i.position)).toEqual([1, 2])
    expect(items.data!.map((i) => i.required)).toEqual([true, false])
    expect((await request()).status).toBe('draft')
  })

  it('request_send creates the version-1 link expiring in 14 days and marks the request sent', async () => {
    const other = await send(OTHER_FIRM)
    expect(other.error?.message).toContain('request_not_found')

    const { data, error } = await send()
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    link = (data as Link[])[0]
    expect(link.version).toBe(1)
    const days = (Date.parse(link.expires_at) - Date.now()) / DAY
    expect(days).toBeGreaterThan(13.9)
    expect(days).toBeLessThan(14.1)
    const row = await request()
    expect(row.status).toBe('sent')
    expect(row.contact_email).toBe('live.probe@example.com')
    expect(row.contact_phone_e164).toBe('+15550109999')
    expect(await countEvents('request.sent', 'request_id', requestId)).toBe(1)
  })

  it("request_send on a sent request raises 'request_not_draft'", async () => {
    const { error } = await send()
    expect(error?.message).toContain('request_not_draft')
  })

  it('request_open sets opened_at once and is idempotent', async () => {
    const first = await open()
    expect(first.error).toBeNull()
    openedAt = first.data as string
    expect(Number.isNaN(Date.parse(openedAt))).toBe(false)
    expect(Date.parse((await linkRow()).opened_at)).toBe(Date.parse(openedAt))
    expect((await request()).status).toBe('opened')

    const second = await open()
    expect(second.error).toBeNull()
    expect(Date.parse(second.data as string)).toBe(Date.parse(openedAt))
    expect(await countEvents('request.opened', 'request_id', requestId)).toBe(1)
  })

  it('request_regenerate_link bumps the version and pushes expiry later', async () => {
    const { data, error } = await regenerate()
    expect(error).toBeNull()
    const next = (data as Link[])[0]
    expect(next.link_id).toBe(link.link_id)
    expect(next.version).toBe(2)
    expect(Date.parse(next.expires_at)).toBeGreaterThan(Date.parse(link.expires_at))
  })

  it('request_revoke sets revoked_at and status revoked', async () => {
    const { error } = await revoke()
    expect(error).toBeNull()
    expect((await linkRow()).revoked_at).not.toBeNull()
    expect((await request()).status).toBe('revoked')
    expect(await countEvents('request.revoked', 'request_id', requestId)).toBe(1)
  })

  it("after revoke: open 'link_inactive', revoke 'request_revoked', regenerate 'request_not_active'", async () => {
    expect((await open()).error?.message).toContain('link_inactive')
    expect((await revoke()).error?.message).toContain('request_revoked')
    expect((await regenerate()).error?.message).toContain('request_not_active')
  })
})
