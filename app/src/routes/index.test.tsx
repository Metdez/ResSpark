import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { Route } from './index'

describe('/ route', () => {
  it('redirects the bare site URL to /admin', () => {
    let thrown: unknown
    try {
      ;(Route.options.beforeLoad as () => unknown)()
    } catch (error) {
      thrown = error
    }
    expect(isRedirect(thrown)).toBe(true)
    expect((thrown as { options: { to: string } }).options.to).toBe('/admin')
  })
})
