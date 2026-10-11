import {
  button,
  cleanup,
  click,
  keyDown,
  renderWithQuery,
  waitFor,
  type Reply,
} from '@/test-utils/query-render'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EsignTemplatesCard } from './esign-templates-card'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const PATH = '/api/admin/esign'
const EMPTY = { engagement_letter: null, form_2848: null, form_8821: null }
const settings = (configured = true) => ({
  configured,
  env: 'test',
  mapping: EMPTY,
})
const TEMPLATES = {
  templates: [
    { id: 1001, name: 'Engagement letter (demo)' },
    { id: 2002, name: 'POA 2848 (demo)' },
  ],
}

async function render(
  body: unknown,
  put: Reply = {
    status: 200,
    body: { mapping: { ...EMPTY, engagement_letter: 1001 } },
  }
) {
  const out = await renderWithQuery(<EsignTemplatesCard />, {
    [`GET ${PATH}/settings`]: { status: 200, body },
    [`GET ${PATH}/templates`]: { status: 200, body: TEMPLATES },
    [`PUT ${PATH}/templates`]: put,
  })
  await waitFor(() => out.el.textContent!.includes('E-sign'))
  return out
}
const triggers = () => [
  ...document.querySelectorAll('[data-slot="select-trigger"]'),
]
async function pick(index: number, name: string) {
  await keyDown(triggers()[index], 'Enter')
  await click(
    [...document.querySelectorAll('[role="option"]')].find(
      (o) => o.textContent === name
    )!
  )
}
const putBody = (fetchMock: ReturnType<typeof vi.fn>) => {
  const call = fetchMock.mock.calls.find(
    ([p, init]) =>
      p === `${PATH}/templates` && (init as RequestInit).method === 'PUT'
  )
  return call && JSON.parse(String((call[1] as RequestInit).body))
}

describe('E-sign templates card', () => {
  afterEach(cleanup)

  it('shows the title, Test mode badge, and three labeled selects with Not set plus template names', async () => {
    const { el } = await render(settings())
    await waitFor(() => triggers().length === 3)
    expect(el.textContent).toContain('E-sign templates')
    expect(el.textContent).toContain('Test mode')
    const labels = [...el.querySelectorAll('label')].map((l) => l.textContent)
    expect(labels).toEqual([
      'Engagement letter',
      'Form 2848 (power of attorney)',
      'Form 8821 (tax information authorization)',
    ])
    await keyDown(triggers()[0], 'Enter')
    const options = [...document.querySelectorAll('[role="option"]')].map(
      (o) => o.textContent
    )
    expect(options).toEqual([
      'Not set',
      'Engagement letter (demo)',
      'POA 2848 (demo)',
    ])
    expect(button('Save templates')!.disabled).toBe(true)
  })

  it('PUTs only the changed key, shows Saving… while pending', async () => {
    const { fetchMock } = await render(settings(), 'pending')
    await waitFor(() => triggers().length === 3)
    await pick(0, 'Engagement letter (demo)')
    await click(button('Save templates')!)
    await waitFor(() => putBody(fetchMock) !== undefined)
    expect(putBody(fetchMock)).toEqual({ engagement_letter: 1001 })
    expect(button('Saving…')!.disabled).toBe(true)
  })

  it('toasts on success', async () => {
    await render(settings())
    await waitFor(() => triggers().length === 3)
    await pick(0, 'Engagement letter (demo)')
    await click(button('Save templates')!)
    await waitFor(() => vi.mocked(toast.success).mock.calls.length > 0)
    expect(toast.success).toHaveBeenCalledWith('E-sign templates saved')
  })

  it('explains a 403 in the card', async () => {
    const { el } = await render(settings(), {
      status: 403,
      body: { error: { code: 'forbidden', message: 'forbidden' } },
    })
    await waitFor(() => triggers().length === 3)
    await pick(0, 'Engagement letter (demo)')
    await click(button('Save templates')!)
    await waitFor(() =>
      el.textContent!.includes('Only an admin can change these.')
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('explains a multi-signer template in the card', async () => {
    const { el } = await render(settings(), {
      status: 422,
      body: {
        error: {
          code: 'template_not_single_signer',
          message: 'template_not_single_signer',
        },
      },
    })
    await waitFor(() => triggers().length === 3)
    await pick(1, 'POA 2848 (demo)')
    await click(button('Save templates')!)
    await waitFor(() =>
      el.textContent!.includes(
        'That template has more than one signer. Use a template with one signer role.'
      )
    )
  })

  it('says e-sign is not set up and renders no select without a key', async () => {
    const { el, fetchMock } = await render(settings(false))
    expect(el.textContent).toContain('E-sign not set up')
    expect(triggers()).toHaveLength(0)
    expect(el.textContent).not.toContain('Test mode')
    expect(fetchMock.mock.calls.some(([p]) => p === `${PATH}/templates`)).toBe(
      false
    )
  })
})
