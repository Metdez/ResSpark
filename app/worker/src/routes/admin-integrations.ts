import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logEvent } from '../db/events'
import { getIntegration, recordIntegrationTest, upsertIntegration, type FirmIntegrationRow } from '../db/integrations'
import { encryptSecret, keyHint } from '../integrations/credential-crypto'
import { LogicsError } from '../integrations/logics/client'
import {
  DEFAULT_LOGICS_BASE_URL,
  liveClientFromRow,
  validateLogicsBaseUrl,
  type LogicsMode,
} from '../integrations/logics/config'
import { staffAuth, type StaffCtx } from '../middleware/staff-auth'

type AdminApp = { Bindings: Env; Variables: { staff: StaffCtx } }

const requireAdmin = (c: Context<AdminApp>) => {
  if (c.var.staff.role !== 'admin') throw new HTTPException(403, { message: 'forbidden' })
}

const modeOf = (env: Env): LogicsMode => (env.LOGICS_MODE === 'fake' ? 'fake' : 'live')

const hasCredentials = (row: FirmIntegrationRow | null): row is FirmIntegrationRow =>
  !!row?.api_key_ciphertext && !!row.secret_ciphertext

// The only shape that leaves the Worker: an explicit field list, never the row (T-02-13).
const toStatus = (row: FirmIntegrationRow | null, mode: LogicsMode) => ({
  configured: hasCredentials(row),
  base_url: row?.base_url ?? DEFAULT_LOGICS_BASE_URL,
  key_hint: row?.key_hint ?? null,
  last_test_at: row?.last_test_at ?? null,
  last_test_ok: row?.last_test_ok ?? null,
  updated_at: row?.updated_at ?? null,
  mode,
})

const nonBlank = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

export const adminIntegrationsRoute = new Hono<AdminApp>()
  .use('*', staffAuth)
  .get('/logics', async (c) => {
    const row = await getIntegration(c.env, c.var.staff.firmId, 'logics')
    return c.json(toStatus(row, modeOf(c.env)))
  })
  .put('/logics', async (c) => {
    requireAdmin(c)
    const body: unknown = await c.req.json().catch(() => null)
    const { api_key, secret_token, base_url } = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >
    if (!nonBlank(api_key) || !nonBlank(secret_token)) throw new HTTPException(400, { message: 'bad_request' })
    if (base_url !== undefined && typeof base_url !== 'string') throw new HTTPException(400, { message: 'bad_request' })
    let url: string
    try {
      // SSRF guard on every save (T-02-14); re-checked again before any live call.
      url = validateLogicsBaseUrl(base_url?.trim() || DEFAULT_LOGICS_BASE_URL, c.env.APP_ENV)
    } catch {
      throw new HTTPException(400, { message: 'invalid_base_url' })
    }
    const key = api_key.trim()
    const [api_key_ciphertext, secret_ciphertext] = await Promise.all([
      encryptSecret(c.env.INTEGRATION_ENC_KEY, key),
      encryptSecret(c.env.INTEGRATION_ENC_KEY, secret_token.trim()),
    ])
    // One row per (firm, provider): concurrent saves resolve last-writer-wins.
    const row = await upsertIntegration(c.env, {
      firm_id: c.var.staff.firmId,
      provider: 'logics',
      base_url: url,
      api_key_ciphertext,
      secret_ciphertext,
      key_hint: keyHint(key),
      updated_by: c.var.staff.userId,
    })
    return c.json(toStatus(row, modeOf(c.env)))
  })
  // Always the live client, whatever LOGICS_MODE says: proving the stored credentials is the point.
  .post('/logics/test', async (c) => {
    requireAdmin(c)
    const { staff } = c.var
    const row = await getIntegration(c.env, staff.firmId, 'logics')
    if (!hasCredentials(row)) throw new HTTPException(400, { message: 'no_credentials' })
    let ok: boolean
    let status: number | null
    try {
      const client = await liveClientFromRow(c.env, row)
      await client.findByEmail(staff.email ?? '')
      ok = true
      status = 200
    } catch (e) {
      if (!(e instanceof LogicsError)) throw e
      ok = false
      status = e.status ?? null
    }
    await recordIntegrationTest(c.env, staff.firmId, 'logics', ok)
    // No email or response data in the payload (T-02-15).
    await logEvent(c.env, {
      firm_id: staff.firmId,
      actor_type: 'staff',
      actor_id: staff.userId,
      action: 'integration.logics.tested',
      payload: { ok, status },
    })
    return c.json({ ok, status, tested_at: new Date().toISOString() })
  })
