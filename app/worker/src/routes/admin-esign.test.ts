import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEsignMapping, setEsignMapping } from '../db/esign-settings'
import { app } from '../index'
import { getTemplate, listTemplates, type DsTemplate } from '../integrations/esign/docuseal'
import { ProviderError } from '../integrations/provider-error'

// Unit tests for the e-sign template mapping routes: no network, db and DocuSeal mocked.
// staffAuth sets a fixed user whose role comes from `x-test-role` when the test sends it.
vi.mock('../db/esign-settings')
vi.mock('../integrations/esign/docuseal', async (orig) => ({
  ...(await orig<typeof import('../integrations/esign/docuseal')>()),
  getTemplate: vi.fn(),
  listTemplates: vi.fn(),
}))
vi.mock('../middleware/staff-auth', async (orig) => {
  const real = await orig<typeof import('../middleware/staff-auth')>()
  return {
    ...real,
    staffAuth: createMiddleware(async (c, next) => {
      const role = c.req.header('x-test-role')
      if (!role) return real.staffAuth(c, next)
      c.set('staff', { userId: 'U1', firmId: 'F1', role, displayName: 'Z' })
      await next()
    }),
  }
})

const BASE = { SUPABASE_URL: 'https://unit.supabase.test', SUPABASE_SECRET_KEY: 'unit' }
const ENV = { ...BASE, DOCUSEAL_API_KEY: 'k', DOCUSEAL_API_URL: 'https://api.docuseal.com' } as unknown as Env
const NO_KEY = BASE as unknown as Env
const MAPPING = { engagement_letter: 1001, form_2848: null, form_8821: null }
const template = (signers = 1) =>
  ({ id: 1001, name: 'Engagement letter (demo)', fields: [], submitters: Array.from({ length: signers }, (_, i) => ({ name: `S${i}`, uuid: `u${i}` })) }) as DsTemplate

const call = (method: string, path: string, opts: { role?: string; body?: unknown; env?: Env } = {}) =>
  app.request(
    `/api/admin/esign${path}`,
    {
      method,
      headers: { 'x-test-role': opts.role ?? 'admin', 'content-type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    },
    opts.env ?? ENV
  )
const put = (body: unknown, opts: { role?: string; env?: Env } = {}) => call('PUT', '/templates', { ...opts, body })
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(getEsignMapping).mockResolvedValue(MAPPING)
  vi.mocked(setEsignMapping).mockResolvedValue(MAPPING)
  vi.mocked(getTemplate).mockResolvedValue(template())
  vi.mocked(listTemplates).mockResolvedValue([{ id: 1001, name: 'Engagement letter (demo)' }])
})

describe('GET /esign/settings', () => {
  it('reports unconfigured test mode with the mapping and calls no DocuSeal API', async () => {
    const res = await call('GET', '/settings', { role: 'staff', env: NO_KEY })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ configured: false, env: 'test', mapping: MAPPING })
    expect(getEsignMapping).toHaveBeenCalledWith(NO_KEY, 'F1')
    expect(listTemplates).not.toHaveBeenCalled()
  })

  it('reports production only when DOCUSEAL_ENV says so', async () => {
    const env = { ...ENV, DOCUSEAL_ENV: 'production' } as unknown as Env
    expect(await (await call('GET', '/settings', { env })).json()).toMatchObject({ configured: true, env: 'production' })
  })

  it('requires a staff session', async () => {
    const res = await app.request('/api/admin/esign/settings', {}, ENV)
    expect(res.status).toBe(401)
  })
})

describe('GET /esign/templates', () => {
  it('is 503 provider_not_configured without a key', async () => {
    const res = await call('GET', '/templates', { env: NO_KEY })
    expect(res.status).toBe(503)
    expect(await code(res)).toBe('provider_not_configured')
  })

  it('lists id and name for any staff member', async () => {
    const res = await call('GET', '/templates', { role: 'staff' })
    expect(await res.json()).toEqual({ templates: [{ id: 1001, name: 'Engagement letter (demo)' }] })
  })

  it('is 502 provider_error when DocuSeal fails', async () => {
    vi.mocked(listTemplates).mockRejectedValue(new ProviderError('docuseal', 500, 'http_500', true))
    const res = await call('GET', '/templates')
    expect(res.status).toBe(502)
    expect(await code(res)).toBe('provider_error')
  })
})

describe('PUT /esign/templates', () => {
  it('is 403 forbidden for staff and writes nothing', async () => {
    const res = await put({ engagement_letter: 1001 }, { role: 'staff' })
    expect(res.status).toBe(403)
    expect(await code(res)).toBe('forbidden')
    expect(setEsignMapping).not.toHaveBeenCalled()
  })

  it('refuses a key outside the whitelist (no 433-A) with bad_template', async () => {
    const res = await put({ form_433a: 1 })
    expect(res.status).toBe(400)
    expect(await code(res)).toBe('bad_template')
    expect(setEsignMapping).not.toHaveBeenCalled()
  })

  it.each([[{ engagement_letter: 'x' }], [{ engagement_letter: 0 }], [{ engagement_letter: 1.5 }], [{}], [[1]], ['x']])(
    'refuses %j with bad_request',
    async (body) => {
      const res = await put(body)
      expect(res.status).toBe(400)
      expect(await code(res)).toBe('bad_request')
    }
  )

  it('checks the template then saves only the sent keys', async () => {
    const res = await put({ engagement_letter: 1001 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mapping: MAPPING })
    expect(getTemplate).toHaveBeenCalledWith(ENV, 1001)
    expect(setEsignMapping).toHaveBeenCalledWith(ENV, 'F1', { engagement_letter: 1001 }, 'U1')
  })

  it('is 422 template_not_single_signer for a two-signer template', async () => {
    vi.mocked(getTemplate).mockResolvedValue(template(2))
    const res = await put({ engagement_letter: 1001 })
    expect(res.status).toBe(422)
    expect(await code(res)).toBe('template_not_single_signer')
    expect(setEsignMapping).not.toHaveBeenCalled()
  })

  it('is 422 template_not_found when DocuSeal answers 404', async () => {
    vi.mocked(getTemplate).mockRejectedValue(new ProviderError('docuseal', 404, 'http_404', false))
    const res = await put({ engagement_letter: 999 })
    expect(res.status).toBe(422)
    expect(await code(res)).toBe('template_not_found')
  })

  it('is 502 provider_error for any other DocuSeal failure', async () => {
    vi.mocked(getTemplate).mockRejectedValue(new ProviderError('docuseal', 500, 'http_500', true))
    expect((await put({ engagement_letter: 1001 })).status).toBe(502)
  })

  it('clears a key with null without calling DocuSeal, even unconfigured', async () => {
    const res = await put({ form_2848: null }, { env: NO_KEY })
    expect(res.status).toBe(200)
    expect(getTemplate).not.toHaveBeenCalled()
    expect(setEsignMapping).toHaveBeenCalledWith(NO_KEY, 'F1', { form_2848: null }, 'U1')
  })

  it('is 503 provider_not_configured for a non-null id without a key', async () => {
    const res = await put({ engagement_letter: 1001 }, { env: NO_KEY })
    expect(res.status).toBe(503)
    expect(await code(res)).toBe('provider_not_configured')
    expect(setEsignMapping).not.toHaveBeenCalled()
  })
})
