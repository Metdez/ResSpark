import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { buildClientCsp, clientCsp } from './client-csp'

const env = { SUPABASE_URL: 'https://abc.supabase.co' } as Env
const app = new Hono<{ Bindings: Env }>()
app.use('/c/*', clientCsp)
app.get('*', (c) => c.text('ok'))
const csp = async (url: string) => (await app.request(url, {}, env)).headers.get('content-security-policy')

describe('client CSP', () => {
  it('builds the D-16 directives with the Supabase origin', () => {
    const value = buildClientCsp(env)
    expect(value).toContain("connect-src 'self' https://*.truv.com https://*.plaid.com https://abc.supabase.co https://*.storage.supabase.co")
    expect(value).toContain("script-src 'self' https://cdn.truv.com https://cdn.plaid.com")
    expect(value).toContain('frame-src https://my.truv.com https://cdn.plaid.com')
    expect(value).toContain("frame-ancestors 'none'")
  })
  it('localhost (Vite dev) gets no CSP', async () => expect(await csp('http://localhost:5173/c/')).toBeNull())
  it('a deployed host gets it', async () => expect(await csp('https://resspark.example.workers.dev/c/')).toBe(buildClientCsp(env)))
  it('/admin/ gets none', async () => expect(await csp('https://resspark.example.workers.dev/admin/')).toBeNull())
})
