import { isRedirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { safeRedirect } from '@/lib/session'
import { Route } from './_shell/route'

const getSession = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession } } }))

// Calls the real beforeLoad with the one context field it reads.
async function runGuard(href: string): Promise<unknown> {
  const beforeLoad = Route.options.beforeLoad as
    | ((ctx: { location: { href: string } }) => unknown)
    | undefined
  try {
    await beforeLoad?.({ location: { href } })
    return 'passed'
  } catch (error) {
    return error
  }
}

describe('/admin/_shell beforeLoad guard', () => {
  beforeEach(() => getSession.mockReset())

  it('redirects a visitor without a session to sign-in, keeping where they were going', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    const result = await runGuard('/admin/settings/appearance')
    expect(isRedirect(result)).toBe(true)
    const { options } = result as { options: { to: string; search: { redirect: string } } }
    expect(options.to).toBe('/admin/sign-in')
    expect(options.search.redirect).toBe('/admin/settings/appearance')
  })

  it('lets a visitor with a session through', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    expect(await runGuard('/admin')).toBe('passed')
    expect(getSession).toHaveBeenCalledTimes(1)
  })
})

describe('safeRedirect', () => {
  it('keeps same-origin /admin paths', () => {
    expect(safeRedirect('/admin/x')).toBe('/admin/x')
    expect(safeRedirect('/admin')).toBe('/admin')
  })

  it.each([
    ['an absolute URL', 'https://evil.example'],
    ['a protocol-relative URL', '//evil'],
    ['undefined', undefined],
    ['a non-admin path', '/c/abc'],
    ['a look-alike prefix', '/administrator'],
    ['a backslash trick', '/admin\\@evil.example'],
  ])('falls back to /admin for %s', (_name, value) => {
    expect(safeRedirect(value)).toBe('/admin')
  })
})
