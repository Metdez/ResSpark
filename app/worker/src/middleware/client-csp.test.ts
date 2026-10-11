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
    expect(value).toContain("connect-src 'self' https://*.truv.com https://*.plaid.com https://docuseal.com https://abc.supabase.co https://*.storage.supabase.co")
    expect(value).toContain("script-src 'self' https://cdn.truv.com https://cdn.plaid.com https://cdn.docuseal.com https://docuseal.com")
    expect(value).toContain('frame-src https://my.truv.com https://cdn.plaid.com')
    expect(value).toContain("frame-ancestors 'none'")
  })
  it('admits DocuSeal script, fetch, and font hosts with no new frame-src host (D-15)', () => {
    const d = Object.fromEntries(
      buildClientCsp(env)
        .split('; ')
        .map((x) => [x.split(' ')[0], x.slice(x.indexOf(' ') + 1)])
    )
    expect(d['script-src']).toContain('https://cdn.docuseal.com https://docuseal.com')
    expect(d['connect-src']).toContain('https://docuseal.com')
    expect(d['font-src']).toBe("'self' data: https://docuseal.com")
    expect(d['frame-src']).toBe('https://my.truv.com https://cdn.plaid.com')
  })
  it('the signing route gets it too (SPA navigation keeps the first document policy)', async () =>
    expect(await csp('https://resspark.example.workers.dev/c/sign/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(buildClientCsp(env)))
  it('localhost (Vite dev) gets no CSP', async () => expect(await csp('http://localhost:5173/c/')).toBeNull())
  it('a deployed host gets it', async () => expect(await csp('https://resspark.example.workers.dev/c/')).toBe(buildClientCsp(env)))
  it('/admin/ gets none', async () => expect(await csp('https://resspark.example.workers.dev/admin/')).toBeNull())
})
