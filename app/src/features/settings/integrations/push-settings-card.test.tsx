import {
  button,
  cleanup,
  click,
  inputByLabel,
  keyDown,
  renderWithQuery,
  type,
  waitFor,
  type Reply,
} from '@/test-utils/query-render'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const DEFAULTS = {
  file_category_id: null,
  activity_type: 'General',
  write_enabled: false,
}
const status = (settings = {}, activity_types: string[] = []) => ({
  configured: true,
  base_url: 'https://valortax.irslogics.com/publicapi/2020-02-22',
  key_hint: '1234',
  last_test_at: null,
  last_test_ok: null,
  updated_at: '2026-10-10T15:00:00Z',
  mode: 'fake',
  settings: { ...DEFAULTS, ...settings },
  activity_types,
})
const SAVED: Reply = { status: 200, body: { settings: DEFAULTS } }

async function render(body: unknown, replies: Record<string, Reply> = {}) {
  const out = await renderWithQuery(<LogicsSettingsPage />, {
    [`GET ${PATH}`]: { status: 200, body },
    [`PUT ${PATH}/settings`]: SAVED,
    ...replies,
  })
  await waitFor(() => out.el.textContent!.includes('Push settings'))
  return out
}
const putBody = (fetchMock: ReturnType<typeof vi.fn>) => {
  const call = fetchMock.mock.calls.find(
    ([p, init]) =>
      p === `${PATH}/settings` && (init as RequestInit).method === 'PUT'
  )
  return call && JSON.parse(String((call[1] as RequestInit).body))
}
const writeSwitch = () =>
  document.querySelector<HTMLButtonElement>('[role="switch"]')!

describe('Push settings', () => {
  beforeEach(() => {
    role = 'admin'
  })
  afterEach(cleanup)

  it('renders the defaults with a free-text activity type when Logics listed none', async () => {
    const { el } = await render(status())
    expect(inputByLabel('File category ID (optional)').value).toBe('')
    expect(inputByLabel('Activity type').value).toBe('General')
    expect(el.querySelector('[data-slot="select-trigger"]')).toBeNull()
    expect(writeSwitch().getAttribute('aria-checked')).toBe('false')
    expect(el.textContent).toContain(
      'Pushes are refused for this firm until this is on.'
    )
    expect(el.textContent).toContain(
      'Not checked — add a test CaseID to LOGICS_TEST_CASE_IDS'
    )
  })

  it('offers the listed activity types in a select', async () => {
    const { el } = await render(status({}, ['Document sent', 'General']))
    expect(el.textContent).toContain(
      'Activity types seen in Logics: Document sent, General'
    )
    await keyDown(el.querySelector('[data-slot="select-trigger"]')!, 'Enter')
    const labels = [...document.querySelectorAll('[role="option"]')].map(
      (o) => o.textContent
    )
    expect(labels).toEqual(['Document sent', 'General'])
  })

  it('saves all three changed fields and toasts', async () => {
    const { el, fetchMock } = await render(
      status({}, ['Document sent', 'General'])
    )
    await type(inputByLabel('File category ID (optional)'), '7')
    await keyDown(el.querySelector('[data-slot="select-trigger"]')!, 'Enter')
    await click(
      [...document.querySelectorAll('[role="option"]')].find(
        (o) => o.textContent === 'Document sent'
      )!
    )
    await click(writeSwitch())
    await click(button('Save')!)
    await waitFor(() => putBody(fetchMock) !== undefined)
    expect(putBody(fetchMock)).toEqual({
      file_category_id: 7,
      activity_type: 'Document sent',
      write_enabled: true,
    })
    await waitFor(() => vi.mocked(toast.success).mock.calls.length > 0)
    expect(toast.success).toHaveBeenCalledWith('Settings saved')
  })

  it('sends only the switch when only the switch changed', async () => {
    const { fetchMock } = await render(status())
    expect(button('Save')!.disabled).toBe(true)
    await click(writeSwitch())
    await click(button('Save')!)
    await waitFor(() => putBody(fetchMock) !== undefined)
    expect(putBody(fetchMock)).toEqual({ write_enabled: true })
  })

  it('rejects 0 inline and never PUTs', async () => {
    const { el, fetchMock } = await render(status())
    await type(inputByLabel('File category ID (optional)'), '0')
    expect(el.textContent).toContain(
      'Enter a whole number of 1 or more, or leave it empty.'
    )
    expect(button('Save')!.disabled).toBe(true)
    await click(button('Save')!)
    expect(putBody(fetchMock)).toBeUndefined()
  })

  it('clearing a saved category sends null', async () => {
    const { fetchMock } = await render(status({ file_category_id: 7 }))
    expect(inputByLabel('File category ID (optional)').value).toBe('7')
    await type(inputByLabel('File category ID (optional)'), '')
    await click(button('Save')!)
    await waitFor(() => putBody(fetchMock) !== undefined)
    expect(putBody(fetchMock)).toEqual({ file_category_id: null })
  })

  it('is read-only for staff', async () => {
    role = 'staff'
    const { el } = await render(status())
    expect(inputByLabel('File category ID (optional)').disabled).toBe(true)
    expect(inputByLabel('Activity type').disabled).toBe(true)
    expect(writeSwitch().disabled).toBe(true)
    expect(button('Save')).toBeUndefined()
    expect(el.textContent).toContain(
      'Only a firm admin can change these settings.'
    )
  })

  it('explains a refused activity listing after a passing test', async () => {
    const { el } = await render(status(), {
      [`POST ${PATH}/test`]: {
        status: 200,
        body: {
          ok: true,
          status: 200,
          tested_at: '2026-10-10T16:00:00Z',
          activity_types_error: 403,
        },
      },
    })
    await click(button('Test connection')!)
    await waitFor(() => el.textContent!.includes('Logics returned 403'))
    expect(el.textContent).toContain(
      'Logics returned 403 for the activity listing — the key may lack case.read on activities; connection still OK'
    )
  })
})
