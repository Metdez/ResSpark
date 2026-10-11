import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  cleanup,
  click,
  inputByLabel,
  postedBody,
  renderWithQuery,
  type,
  waitFor,
  type Reply,
} from '@/test-utils/query-render'
import { LogicsSettingsPage } from './logics-settings-page'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
let role: 'admin' | 'staff' = 'admin'
vi.mock('@/lib/session', () => ({
  useSession: () => ({ data: { role } }),
}))

const PATH = '/api/admin/integrations/logics'
const EMPTY = {
  configured: false,
  base_url: 'https://valortax.irslogics.com/publicapi/2020-02-22',
  key_hint: null,
  last_test_at: null,
  last_test_ok: null,
  updated_at: null,
  mode: 'fake',
}
const SAVED = {
  ...EMPTY,
  configured: true,
  key_hint: '1234',
  updated_at: '2026-10-10T15:00:00Z',
}
const SECRET = 'sk-live-very-secret-value'

async function render(status: unknown, replies: Record<string, Reply> = {}) {
  const out = await renderWithQuery(<LogicsSettingsPage />, {
    [`GET ${PATH}`]: { status: 200, body: status },
    ...replies,
  })
  await waitFor(() => out.el.textContent!.includes('IRS Logics'))
  return out
}
async function fillSecrets() {
  await type(inputByLabel('API key'), 'key-1234')
  await type(inputByLabel('Secret token'), SECRET)
}
const putBody = (fetchMock: ReturnType<typeof vi.fn>) => {
  const call = fetchMock.mock.calls.find(
    ([p, init]) => p === PATH && (init as RequestInit).method === 'PUT'
  )
  return call && JSON.parse(String((call[1] as RequestInit).body))
}
const testReply = (body: unknown): Record<string, Reply> => ({
  [`POST ${PATH}/test`]: { status: 200, body },
})

describe('LogicsSettingsPage', () => {
  beforeEach(() => {
    role = 'admin'
  })
  afterEach(cleanup)

  it('shows the empty state, fixture notice, and the credentials form', async () => {
    const { el } = await render(EMPTY)
    expect(el.textContent).toContain('IRS Logics')
    expect(el.textContent).toContain('No credentials saved')
    expect(el.textContent).toContain('Using built-in test cases')
    expect(el.textContent).toContain(
      "Lookups use ResSpark's sample cases until the Logics mode is switched to live."
    )
    expect(inputByLabel('API key').type).toBe('password')
    expect(inputByLabel('Secret token').type).toBe('password')
    expect(inputByLabel('Base URL (optional)')).toBeTruthy()
    expect(el.textContent).toContain('Leave blank for the ValorTax default.')
    expect(el.textContent).toContain('Show password')
    expect(button('Save credentials')?.disabled).toBe(true)
    expect(button('Test connection')?.disabled).toBe(true)
  })

  it('hides the fixture notice in live mode', async () => {
    const { el } = await render({ ...SAVED, mode: 'live' })
    expect(el.textContent).not.toContain('Using built-in test cases')
  })

  it('enables Save credentials once both secrets are typed', async () => {
    await render(EMPTY)
    await type(inputByLabel('API key'), 'key-1234')
    expect(button('Save credentials')?.disabled).toBe(true)
    await type(inputByLabel('Secret token'), SECRET)
    expect(button('Save credentials')?.disabled).toBe(false)
  })

  it('reads Saving… while the save is in flight', async () => {
    const { el } = await render(EMPTY, { [`PUT ${PATH}`]: 'pending' })
    await fillSecrets()
    await click(button('Save credentials')!)
    await waitFor(() => el.textContent!.includes('Saving…'))
    expect(button('Saving…')?.disabled).toBe(true)
  })

  it('saves without base_url, then shows only the hint and clears the inputs', async () => {
    const { el, fetchMock } = await render(EMPTY, {
      [`PUT ${PATH}`]: { status: 200, body: SAVED },
    })
    await fillSecrets()
    await click(button('Save credentials')!)
    await waitFor(() => el.textContent!.includes('Key ending in'))
    expect(putBody(fetchMock)).toEqual({
      api_key: 'key-1234',
      secret_token: SECRET,
    })
    expect(el.textContent).toContain('Key ending in ••••1234')
    expect(el.textContent).toContain('Updated Oct 10, 2026')
    expect(inputByLabel('API key').value).toBe('')
    expect(inputByLabel('Secret token').value).toBe('')
    expect(button('Test connection')?.disabled).toBe(false)
    expect(document.body.innerHTML).not.toContain(SECRET)
  })

  it('sends a typed base URL and shows its inline error', async () => {
    const { el, fetchMock } = await render(EMPTY, {
      [`PUT ${PATH}`]: {
        status: 400,
        body: { error: { code: 'invalid_base_url', message: 'x' } },
      },
    })
    await fillSecrets()
    await type(inputByLabel('Base URL (optional)'), 'http://evil.test')
    await click(button('Save credentials')!)
    await waitFor(() => el.textContent!.includes('Enter an https:// address.'))
    expect(putBody(fetchMock).base_url).toBe('http://evil.test')
    const base = inputByLabel('Base URL (optional)')
    expect(base.getAttribute('aria-invalid')).toBe('true')
  })

  it('tests the connection and reports success', async () => {
    const { el, fetchMock } = await render(
      SAVED,
      testReply({ ok: true, status: 200, tested_at: '2026-10-10T16:00:00Z' })
    )
    await click(button('Test connection')!)
    await waitFor(() => el.textContent!.includes('Connected'))
    expect(postedBody(fetchMock, `${PATH}/test`)).toEqual({})
    expect(el.textContent).toContain(
      'Connected — Logics accepted the credentials on Oct 10, 2026.'
    )
  })

  it('reads Testing… while the test is in flight', async () => {
    const { el } = await render(SAVED, { [`POST ${PATH}/test`]: 'pending' })
    await click(button('Test connection')!)
    await waitFor(() => el.textContent!.includes('Testing…'))
    expect(button('Testing…')?.disabled).toBe(true)
  })

  it('explains rejected credentials', async () => {
    const { el } = await render(
      SAVED,
      testReply({ ok: false, status: 401, tested_at: '2026-10-10T16:00:00Z' })
    )
    await click(button('Test connection')!)
    await waitFor(() => el.textContent!.includes('Logics rejected the credentials'))
    expect(el.textContent).toContain(
      'Check the API key and secret token and save again.'
    )
  })

  it('explains an unreachable Logics', async () => {
    const { el } = await render(
      SAVED,
      testReply({ ok: false, status: null, tested_at: '2026-10-10T16:00:00Z' })
    )
    await click(button('Test connection')!)
    await waitFor(() => el.textContent!.includes("Couldn't reach Logics"))
    expect(el.textContent).toContain('Check the base URL and try again.')
  })

  it('shows the last test result from the status', async () => {
    const { el } = await render({
      ...SAVED,
      last_test_ok: false,
      last_test_at: '2026-10-09T15:00:00Z',
    })
    expect(el.textContent).toContain('Last test: failed Oct 9, 2026')
  })

  it('is read-only for staff', async () => {
    role = 'staff'
    const { el } = await render(SAVED)
    expect(el.textContent).toContain('Key ending in ••••1234')
    expect(el.textContent).toContain(
      'Only a firm admin can change these credentials.'
    )
    expect(inputByLabel('API key').disabled).toBe(true)
    expect(inputByLabel('Secret token').disabled).toBe(true)
    expect(inputByLabel('Base URL (optional)').disabled).toBe(true)
    expect(button('Save credentials')).toBeUndefined()
    expect(button('Test connection')).toBeUndefined()
  })
})
