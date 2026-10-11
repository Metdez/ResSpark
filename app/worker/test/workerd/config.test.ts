import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

// Spike (a): the Worker running in workerd via @cloudflare/vitest-plugin (D-21, D-22a).
describe('workerd /api/config', () => {
  it('returns the sandbox flags from the real runtime', async () => {
    const res = await SELF.fetch('http://x/api/config')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ app_env: 'sandbox' })
  })
})
