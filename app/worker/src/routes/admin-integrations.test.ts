import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logEvent } from '../db/events'
import { getIntegration, recordIntegrationTest, updateSettings, type FirmIntegrationRow } from '../db/integrations'
import type { LogicsClient } from '../integrations/logics/client'
import { liveClientFromRow } from '../integrations/logics/config'
import { adminIntegrationsRoute } from './admin-integrations'

const staff = { userId: 'U1', firmId: 'F1', role: 'admin', displayName: 'Dana Admin', email: 'dana@example.com' }
vi.mock('../middleware/staff-auth', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    staffAuth: createMiddleware(async (c, next) => {
      c.set('staff', { ...staff })
      await next()
    }),
  }
})
vi.mock('../db/events', () => ({ logEvent: vi.fn() }))
vi.mock('../db/integrations', async (orig) => ({
  ...(await orig<typeof import('../db/integrations')>()),
  getIntegration: vi.fn(),
  recordIntegrationTest: vi.fn(),
  updateSettings: vi.fn(),
  upsertIntegration: vi.fn(),
}))
vi.mock('../integrations/logics/config', async (orig) => ({
  ...(await orig<typeof import('../integrations/logics/config')>()),
  liveClientFromRow: vi.fn(),
}))

const envOf = (over: Record<string, string> = {}) => ({ LOGICS_MODE: 'fake', LOGICS_TEST_CASE_IDS: '900001', ...over }) as unknown as Env
const app = new Hono<{ Bindings: Env }>()
  .route('/api/admin/integrations', adminIntegrationsRoute)
  .onError((e, c) => c.json({ error: { code: e instanceof HTTPException ? e.message : 'internal' } }, e instanceof HTTPException ? e.status : 500))
const req = (method: string, path: string, body?: unknown, env = envOf()) =>
  app.request(
    `/api/admin/integrations/logics${path}`,
    body === undefined ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    env
  )
const rowWith = (settings: Record<string, unknown>) =>
  ({ base_url: 'https://x/', api_key_ciphertext: 'a', secret_ciphertext: 'b', settings }) as unknown as FirmIntegrationRow
const listActivities = vi.fn()

beforeEach(() => {
  staff.role = 'admin'
  vi.mocked(getIntegration).mockResolvedValue(rowWith({}))
  vi.mocked(updateSettings).mockImplementation(async (_env, _firm, patch) => ({
    file_category_id: null,
    activity_type: 'General',
    write_enabled: false,
    activity_types_seen: [],
    ...patch,
  }))
  listActivities.mockResolvedValue({ activityTypes: ['General', 'Document sent'] })
  vi.mocked(liveClientFromRow).mockResolvedValue({ findByEmail: vi.fn().mockResolvedValue([]), listActivities } as unknown as LogicsClient)
})
afterEach(() => vi.clearAllMocks())

describe('GET /integrations/logics', () => {
  it('returns default settings and no activity types for an empty settings object', async () => {
    const body = (await (await req('GET', '')).json()) as Record<string, unknown>
    expect(body.settings).toEqual({ file_category_id: null, activity_type: 'General', write_enabled: false })
    expect(body.activity_types).toEqual([])
  })
})

describe('PUT /integrations/logics/settings', () => {
  it('403 for role staff', async () => {
    staff.role = 'staff'
    expect((await req('PUT', '/settings', { write_enabled: true })).status).toBe(403)
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('200 with the merged settings; logs settings_updated with the changed keys only', async () => {
    const patch = { file_category_id: 7, activity_type: 'Document sent', write_enabled: true }
    const res = await req('PUT', '/settings', patch)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ settings: patch })
    expect(updateSettings).toHaveBeenCalledWith(expect.anything(), 'F1', patch)
    expect(logEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'integration.logics.settings_updated', payload: { changed: Object.keys(patch) } })
    )
  })

  it('400 bad_request for a bad category, a blank activity type, an unknown key or an empty body', async () => {
    for (const body of [{ file_category_id: 'x' }, { file_category_id: 0 }, { activity_type: '' }, { activity_type: 'a'.repeat(61) }, { api_key: 'k' }, {}]) {
      const res = await req('PUT', '/settings', body)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('bad_request')
    }
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('file_category_id null clears it', async () => {
    await req('PUT', '/settings', { file_category_id: null })
    expect(updateSettings).toHaveBeenCalledWith(expect.anything(), 'F1', { file_category_id: null })
  })
})

describe('POST /integrations/logics/test', () => {
  it('lists ActivityType strings for the first allowlisted case and stores them sorted', async () => {
    const res = await req('POST', '/test')
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true)
    expect(listActivities).toHaveBeenCalledWith(900001)
    expect(updateSettings).toHaveBeenCalledWith(expect.anything(), 'F1', { activity_types_seen: ['Document sent', 'General'] })
    expect(recordIntegrationTest).toHaveBeenCalledWith(expect.anything(), 'F1', 'logics', true)
  })

  it('does not list without an allowlist', async () => {
    await req('POST', '/test', undefined, envOf({ LOGICS_TEST_CASE_IDS: '' }))
    expect(listActivities).not.toHaveBeenCalled()
  })

  it('a failed listing keeps the test ok and the settings unchanged', async () => {
    listActivities.mockResolvedValue({ kind: 'failed', status: 403 })
    const body = (await (await req('POST', '/test')).json()) as Record<string, unknown>
    expect(body).toMatchObject({ ok: true, activity_types_error: 403 })
    expect(updateSettings).not.toHaveBeenCalled()
  })
})
