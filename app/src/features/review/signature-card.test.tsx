import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import * as requests from '@/features/requests/requests-api'
import type { RequestDetail } from '@/features/requests/requests-api'
import type { ReviewItem, SignatureView } from './api'
import * as connections from './connections/api'
import { SignatureCard } from './signature-card'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/requests/requests-api', async (orig) => ({
  ...(await orig<typeof import('@/features/requests/requests-api')>()),
  getRequest: vi.fn(),
  markCopied: vi.fn(),
  emailLink: vi.fn(),
}))
vi.mock('./connections/api', async (orig) => ({
  ...(await orig<typeof import('./connections/api')>()),
  refreshConnection: vi.fn(),
}))

const ITEM: ReviewItem = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  position: 1,
  kind: 'signature',
  label: 'Sign your form',
  required: true,
  status: 'submitted',
  rejection_note: null,
  documents: [],
}
const view = (over: Partial<SignatureView> = {}, conn: Partial<NonNullable<SignatureView['connection']>> | null = {}): SignatureView => ({
  item_id: ITEM.id,
  template_key: 'engagement_letter',
  configured: true,
  connection:
    conn === null
      ? null
      : { id: 'k1', status: 'done', stage: 'signed', env: 'test', error_code: null, completed_at: '2026-10-11T09:00:00Z', ...conn },
  ...over,
})
const detail = (link: RequestDetail['link']) => ({ id: 'r1', contact_email: 'morgan.lee@example.com', link }) as unknown as RequestDetail
const LINK = { url: 'https://x.example/c/TOKEN', version: 1, expires_at: '2026-10-25T00:00:00Z', revoked_at: null, opened_at: null }

let root: Root | undefined
let container: HTMLDivElement
const writeText = vi.fn()

const tick = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

async function render(signature: SignatureView | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <SignatureCard item={ITEM} signature={signature} requestId='r1' />
      </QueryClientProvider>
    )
  })
  await tick()
  return client
}

const button = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined
const click = (el: HTMLElement) =>
  act(async () => {
    el.click()
  })

beforeEach(() => {
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  vi.mocked(requests.getRequest).mockResolvedValue(detail(LINK))
  vi.mocked(requests.markCopied).mockResolvedValue({ ok: true } as never)
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SignatureCard', () => {
  it('shows the template name, the Signed chip and the Test badge for a done test-mode view', async () => {
    await render(view())
    expect(container.textContent).toContain('Engagement letter')
    expect(container.textContent).toContain('Signed')
    expect(container.textContent).toContain('Test')
  })

  it('omits the Test badge in production and falls back to the item label without a template', async () => {
    await render(view({ template_key: null }, { env: 'production', stage: 'viewed' }))
    expect(container.textContent).toContain('Sign your form')
    expect(container.textContent).toContain('Viewed')
    expect(container.textContent).not.toContain('Test')
  })

  it('copies the ResSpark link plus ?step=<item id> and records the copy', async () => {
    await render(view())
    await click(button('Copy signing link')!)
    await tick()
    expect(writeText).toHaveBeenCalledWith(`https://x.example/c/TOKEN?step=${ITEM.id}`)
    expect(toast.success).toHaveBeenCalledWith('Signing link copied')
    expect(requests.markCopied).toHaveBeenCalledWith('r1')
  })

  it.each([
    ['a revoked link', { ...LINK, url: null, revoked_at: '2026-10-11T01:00:00Z' }],
    ['no link', null],
  ])('disables the copy with %s', async (_name, link) => {
    vi.mocked(requests.getRequest).mockResolvedValue(detail(link))
    await render(view({}, null))
    expect(button('Copy signing link')!.disabled).toBe(true)
    expect(container.textContent).toContain('Send the request first.')
    expect(container.textContent).toContain('Waiting')
  })

  it('never renders a DocuSeal URL in text or attributes', async () => {
    await render(view())
    expect(container.innerHTML).not.toContain('docuseal.com')
  })
})

describe('SignatureCard actions and notes', () => {
  it('refreshes through the Phase 4 route, shows Refreshing… while pending, then invalidates the review', async () => {
    let settle: (v: never) => void = () => {}
    vi.mocked(connections.refreshConnection).mockReturnValue(new Promise((r) => (settle = r)))
    const client = await render(view({}, { status: 'pending', stage: 'waiting' }))
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await click(button('Refresh')!)
    await tick()
    expect(connections.refreshConnection).toHaveBeenCalledWith('k1')
    expect(button('Refreshing…')!.disabled).toBe(true)
    await act(async () => settle({ connection: {} } as never))
    await tick()
    expect(invalidate.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual(['review', 'r1'])
  })

  it('toasts the generic error with the muted code on 502 provider_unavailable', async () => {
    vi.mocked(connections.refreshConnection).mockRejectedValue(new ApiError(502, 'provider_unavailable', 'provider_unavailable'))
    await render(view())
    await click(button('Refresh')!)
    await tick()
    expect(toast.error).toHaveBeenCalledWith(GENERIC_ERROR, expect.objectContaining({ description: expect.anything() }))
  })

  it('emails the signing link with the item step and shows the sent copy', async () => {
    vi.mocked(requests.emailLink).mockResolvedValue({ ok: true, id: 'em_1' })
    await render(view())
    await click(button('Email signing link')!)
    await tick()
    expect(requests.emailLink).toHaveBeenCalledWith('r1', ITEM.id)
    expect(container.textContent).toContain('Email sent to morgan.lee@example.com')
  })

  it('shows the Phase 2 copy-it-yourself message when email is not configured', async () => {
    vi.mocked(requests.emailLink).mockResolvedValue({ ok: false, reason: 'not_configured' })
    await render(view())
    await click(button('Email signing link')!)
    await tick()
    expect(container.textContent).toContain('Email not configured — copy the link and send it yourself')
  })

  it('reads E-sign not set up and hides Refresh when not configured', async () => {
    await render(view({ configured: false }))
    expect(container.textContent).toContain('E-sign not set up')
    expect(button('Refresh')).toBeUndefined()
  })

  const IRS =
    "E-signed copies must be submitted online at IRS.gov/Submit2848 or IRS.gov/Submit8821, and you must authenticate the client's identity for a remote signature."
  const PART_II = 'The representative signs Part II outside the portal.'

  it('shows the IRS online note on a Form 8821 card', async () => {
    await render(view({ template_key: 'form_8821' }))
    expect(container.textContent).toContain(IRS)
    expect(container.textContent).not.toContain(PART_II)
  })

  it('adds the Part II line on a Form 2848 card', async () => {
    await render(view({ template_key: 'form_2848' }))
    expect(container.textContent).toContain(IRS)
    expect(container.textContent).toContain(PART_II)
  })

  it('shows no IRS note on an engagement letter', async () => {
    await render(view())
    expect(container.textContent).not.toContain('IRS.gov')
  })
})
