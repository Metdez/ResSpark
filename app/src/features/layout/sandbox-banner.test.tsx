import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SandboxBanner } from './sandbox-banner'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

const COPY = 'Test environment — nothing here is sent to IRS Logics.'
let root: Root | undefined
let container: HTMLDivElement | undefined

async function render(fetchImpl: () => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  const client = new QueryClient()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <SandboxBanner />
      </QueryClientProvider>
    )
  })
  // let the query settle (fetch mock + json + state update)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
  return container
}

const json = (body: unknown) => async () => ({
  ok: true,
  status: 200,
  json: async () => body,
})

describe('SandboxBanner', () => {
  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    vi.unstubAllGlobals()
  })

  it('says Logics writes are simulated in fake mode, with no close control', async () => {
    const el = await render(
      json({
        app_env: 'sandbox',
        logics_write_enabled: false,
        app_name: 'ResSpark',
        logics_mode: 'fake',
      })
    )
    expect(el.textContent).toContain('SANDBOX')
    expect(el.textContent).toContain('Logics writes simulated')
    expect(el.querySelector('button')).toBeNull()
  })

  it('names the allowlist in live mode', async () => {
    const el = await render(
      json({
        app_env: 'sandbox',
        logics_write_enabled: true,
        app_name: 'ResSpark',
        logics_mode: 'live',
      })
    )
    expect(el.textContent).toContain('SANDBOX')
    expect(el.textContent).toContain(
      'Test environment — Logics writes go to allowlisted test cases only'
    )
  })

  it('keeps the fail-safe copy when logics_mode is not fake or live', async () => {
    const el = await render(
      json({
        app_env: 'sandbox',
        logics_write_enabled: false,
        app_name: 'ResSpark',
        logics_mode: 'other',
      })
    )
    expect(el.textContent).toContain(COPY)
  })

  it('shows while /api/config is still pending (app_env undefined)', async () => {
    const el = await render(() => new Promise(() => {}))
    expect(el.textContent).toContain(COPY)
  })

  it('shows when /api/config fails (absence of proof is sandbox)', async () => {
    const el = await render(() => Promise.reject(new Error('down')))
    expect(el.textContent).toContain(COPY)
  })

  it('is absent only when app_env is production', async () => {
    const el = await render(
      json({
        app_env: 'production',
        logics_write_enabled: false,
        app_name: 'ResSpark',
        logics_mode: 'fake',
      })
    )
    expect(el.textContent).toBe('')
  })
})
