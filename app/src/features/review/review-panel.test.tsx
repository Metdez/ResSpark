import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider, keepPreviousData, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { pollInterval } from '@/lib/polling'
import * as api from './api'
import type { ReviewResponse } from './api'
import { ReviewPanel } from './review-panel'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  fetchReview: vi.fn(),
  documentUrl: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}))
vi.mock('@/features/requests/requests-api', async (orig) => ({
  ...(await orig<typeof import('@/features/requests/requests-api')>()),
  getRequest: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@tanstack/react-query', async (orig) => {
  const real = await orig<typeof import('@tanstack/react-query')>()
  return { ...real, useQuery: vi.fn(real.useQuery) }
})

const doc = (id: string, status = 'ready') => ({
  id,
  name: `${id}.pdf`,
  mime: 'application/pdf',
  size_bytes: 2048,
  status,
  uploaded_at: '2026-10-11T08:00:00Z',
  rejection_note: null,
})
const item = (over: Partial<api.ReviewItem>): api.ReviewItem => ({
  id: 'i1',
  position: 1,
  kind: 'upload',
  label: 'Bank statements',
  required: true,
  status: 'submitted',
  rejection_note: null,
  documents: [],
  ...over,
})
const REVIEW: ReviewResponse = {
  request: { id: 'r1', case_id: 'c1', status: 'waiting_on_staff', opened_at: '2026-10-11T07:00:00Z' },
  items: [
    item({ id: 'i1', position: 1, label: 'Bank statements', documents: [doc('d1'), doc('d2')] }),
    item({ id: 'i2', position: 2, label: 'Pay stubs', status: 'pending' }),
  ],
  client_session: null,
}

let root: Root | undefined
let container: HTMLDivElement

const tick = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <ReviewPanel requestId='r1' caseId='c1' />
      </QueryClientProvider>
    )
  })
  await tick()
}

const button = (text: string, scope: ParentNode = document.body) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement
const itemEl = (id: string) => container.querySelector(`[data-review-item="${id}"]`) as HTMLElement
const click = (el: HTMLElement) =>
  act(async () => {
    el.click()
  })

async function typeNote(value: string) {
  const area = document.body.querySelector('textarea')!
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(area, value)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.mocked(api.fetchReview).mockResolvedValue(REVIEW)
  vi.mocked(api.documentUrl).mockResolvedValue({ url: 'https://s.test/x?token=t', expires_in: 300, disposition: 'inline' })
  vi.mocked(api.approve).mockResolvedValue({ item_status: 'approved', request_status: 'complete' })
  vi.mocked(api.reject).mockResolvedValue({ item_status: 'rejected', request_status: 'in_progress' })
  vi.stubGlobal('open', vi.fn())
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('ReviewPanel', () => {
  it('polls the review with pollInterval and keeps previous data', async () => {
    await render()
    const calls = vi.mocked(useQuery).mock.calls
    const options = calls[calls.length - 1][0]
    expect(options.queryKey).toEqual(['review', 'r1'])
    expect(options.refetchInterval).toBe(pollInterval)
    expect(options.placeholderData).toBe(keepPreviousData)
  })

  it('shows three skeleton rows while loading', async () => {
    vi.mocked(api.fetchReview).mockReturnValue(new Promise(() => {}))
    await render()
    expect(container.querySelectorAll('[data-skeleton]')).toHaveLength(3)
  })

  it('lists items in position order with their documents, and disables Approve without files', async () => {
    await render()
    const items = [...container.querySelectorAll('[data-review-item]')].map((e) => e.getAttribute('data-review-item'))
    expect(items).toEqual(['i1', 'i2'])
    const rows = [...itemEl('i1').querySelectorAll('[data-document-row]')].map((e) => e.getAttribute('data-document-row'))
    expect(rows).toEqual(['d1', 'd2'])
    expect(itemEl('i1').querySelectorAll('[aria-label="Preview"]')).toHaveLength(2)
    expect(itemEl('i1').querySelectorAll('[aria-label="Download"]')).toHaveLength(2)
    expect(itemEl('i1').textContent).toContain('Ready')
    expect(button('Approve', itemEl('i1')).disabled).toBe(false)
    expect(button('Approve', itemEl('i2')).disabled).toBe(true)
    expect(itemEl('i2').textContent).toContain('No files yet')
  })

  it('opens Preview and Download in a new tab with noopener', async () => {
    await render()
    await click(itemEl('i1').querySelector('[aria-label="Preview"]') as HTMLElement)
    await tick()
    expect(api.documentUrl).toHaveBeenCalledWith('d1', 'inline')
    expect(window.open).toHaveBeenCalledWith('https://s.test/x?token=t', '_blank', 'noopener')
    await click(itemEl('i1').querySelector('[aria-label="Download"]') as HTMLElement)
    await tick()
    expect(api.documentUrl).toHaveBeenCalledWith('d1', 'attachment')
  })

  it('rejects with a preset note through the dialog', async () => {
    await render()
    await click(button('Reject', itemEl('i1')))
    expect(document.body.textContent).toContain('Reject this item?')
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    for (const p of ['blurry', 'wrong document', 'missing pages', 'need all pages']) expect(button(p, dialog)).toBeTruthy()
    expect(button('Reject', dialog).disabled).toBe(true)
    await click(button('blurry', dialog))
    expect(button('Reject', dialog).disabled).toBe(false)
    await click(button('Reject', dialog))
    await tick()
    expect(api.reject).toHaveBeenCalledWith('i1', 'blurry')
  })

  it('keeps Reject disabled and warns when the note is over 500 characters', async () => {
    await render()
    await click(button('Reject', itemEl('i1')))
    await typeNote('x'.repeat(501))
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('Keep the note under 500 characters.')
    expect(button('Reject', dialog).disabled).toBe(true)
  })

  it('approves and invalidates the review, request, dashboard and events queries', async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    await render()
    await click(button('Approve', itemEl('i1')))
    await tick()
    expect(api.approve).toHaveBeenCalledWith('i1')
    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([['review', 'r1'], ['request', 'r1'], ['requests'], ['events', 'c1']]))
    invalidate.mockRestore()
  })

  it('explains a 409 on approve with the code in muted text', async () => {
    vi.mocked(api.approve).mockRejectedValue(new ApiError(409, 'item_not_submitted', 'item_not_submitted'))
    await render()
    await click(button('Approve', itemEl('i1')))
    await tick()
    expect(itemEl('i1').textContent).toContain('Nothing to approve yet.')
    expect(itemEl('i1').querySelector('[role="alert"] span.text-muted-foreground')?.textContent).toBe('item_not_submitted')
  })

  it('shows a rejected item with its note and a Rejected badge', async () => {
    vi.mocked(api.fetchReview).mockResolvedValue({
      ...REVIEW,
      items: [item({ status: 'rejected', rejection_note: 'blurry', documents: [doc('d1', 'rejected')] })],
    })
    await render()
    expect(itemEl('i1').textContent).toContain('Note to client: blurry')
    expect(itemEl('i1').textContent).toContain('Rejected')
  })
})

describe('ReviewPanel address item', () => {
  const ADDRESS: api.CaseAddressView = {
    line1: '1600 Amphitheatre Pkwy', line2: null, city: 'Mountain View', state_code: 'CA', zip5: '94043', zip4: '1351',
    county_name: 'Santa Clara', county_fips: '06085', rdi: 'Commercial', dpv: 'Y', verified: true, source: 'smarty',
    confirmed_at: '2026-10-11T08:00:00Z',
  }

  it('renders the address card inside the item and keeps Approve and Reject', async () => {
    vi.mocked(api.fetchReview).mockResolvedValue({
      ...REVIEW,
      items: [item({ id: 'a1', kind: 'address', label: 'Confirm your address' })],
      address: ADDRESS,
    })
    await render()
    const el = itemEl('a1')
    expect(el.querySelector('[data-address-card]')!.textContent).toContain('Santa Clara County (06085)')
    expect(el.textContent).not.toContain('No files yet')
    expect(button('Approve', el).disabled).toBe(false)
    expect(button('Reject', el).disabled).toBe(false)
    await click(button('Approve', el))
    expect(api.approve).toHaveBeenCalledWith('a1')
  })
})

describe('ReviewPanel signature item', () => {
  it('renders the signature card above its two document rows and keeps Approve and Reject', async () => {
    vi.mocked(api.fetchReview).mockResolvedValue({
      ...REVIEW,
      items: [item({ id: 's1', kind: 'signature', label: 'Sign your form', documents: [doc('signed'), doc('audit')] })],
      signatures: [
        {
          item_id: 's1',
          template_key: 'engagement_letter',
          configured: true,
          connection: { id: 'k1', status: 'done', stage: 'signed', env: 'production', error_code: null, completed_at: '2026-10-11T09:00:00Z' },
        },
      ],
    })
    await render()
    const el = itemEl('s1')
    const card = el.querySelector('[data-signature-card]')!
    expect(card.textContent).toContain('Engagement letter')
    expect(card.textContent).toContain('Signed')
    const rows = [...el.querySelectorAll('[data-document-row]')]
    expect(rows.map((r) => r.getAttribute('data-document-row'))).toEqual(['signed', 'audit'])
    expect(card.compareDocumentPosition(rows[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button('Approve', el).disabled).toBe(false)
    expect(button('Reject', el).disabled).toBe(false)
  })
})

describe('ReviewPanel connection items', () => {
  it('points at the connection card instead of "No files yet"', async () => {
    vi.mocked(api.fetchReview).mockResolvedValue({
      ...REVIEW,
      items: [
        item({ id: 'b1', kind: 'bank_connect', label: 'Connect your bank' }),
        item({ id: 'p1', kind: 'payroll_connect', label: 'Connect your payroll' }),
        item({ id: 'u1', kind: 'upload', label: 'Other documents' }),
      ],
    })
    await render()
    expect(itemEl('b1').textContent).toContain('No statements yet. Accounts and transactions are in the bank connection above.')
    expect(itemEl('p1').textContent).toContain('No pay stubs yet. Employers are in the payroll connection above.')
    expect(itemEl('b1').textContent).not.toContain('No files yet')
    expect(itemEl('p1').textContent).not.toContain('No files yet')
    expect(itemEl('u1').textContent).toContain('No files yet')
  })

  it('lets staff reject an auto-approved connection item that has no files', async () => {
    vi.mocked(api.fetchReview).mockResolvedValue({
      ...REVIEW,
      items: [
        item({ id: 'b1', kind: 'bank_connect', label: 'Connect your bank', status: 'approved' }),
        item({ id: 'u1', kind: 'upload', label: 'Other documents' }),
      ],
    })
    await render()
    expect(button('Reject', itemEl('b1')).disabled).toBe(false)
    expect(button('Approved', itemEl('b1')).disabled).toBe(true)
    expect(button('Reject', itemEl('u1')).disabled).toBe(true)
  })
})
