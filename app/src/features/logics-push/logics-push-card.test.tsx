import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pollInterval } from '@/lib/polling'
import type { ReviewItem } from '@/features/review/api'
import { useReview } from '@/features/review/use-review'
import * as api from './api'
import type { LedgerPush, LedgerResponse } from './api'
import { LogicsPushCard } from './logics-push-card'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/review/use-review', () => ({ useReview: vi.fn() }))
vi.mock('@/lib/session', () => ({ useSession: () => ({ data: { display_name: 'Dana Agent' } }) }))
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  fetchLedger: vi.fn(),
  createPush: vi.fn(),
  resolvePush: vi.fn(),
}))
vi.mock('@tanstack/react-query', async (orig) => {
  const real = await orig<typeof import('@tanstack/react-query')>()
  return { ...real, useQuery: vi.fn(real.useQuery) }
})

const doc = (id: string, size: number, status = 'ready') => ({
  id,
  name: `${id}.pdf`,
  mime: 'application/pdf',
  size_bytes: size,
  status,
  uploaded_at: '2026-10-11T08:00:00Z',
  rejection_note: null,
})
const item = (over: Partial<ReviewItem>): ReviewItem => ({
  id: 'i1',
  position: 1,
  kind: 'upload',
  label: 'Bank statements',
  required: true,
  status: 'approved',
  rejection_note: null,
  documents: [],
  ...over,
})
const ITEMS = [
  item({ documents: [doc('small', 2048), doc('big', 7 * 1024 * 1024), doc('bad', 100, 'rejected')] }),
  item({ id: 'i2', label: 'Pay stubs', status: 'submitted', documents: [doc('stub', 100)] }),
]
const push = (over: Partial<LedgerPush>): LedgerPush => ({
  id: 'p1',
  document_id: 'small',
  part_index: 0,
  part_count: null,
  file_name: 'small.pdf',
  state: 'sent',
  mode: 'fake',
  logics_document_id: 128346,
  error_code: null,
  error_detail: null,
  needs_manual_compression: false,
  attempts: 1,
  claimed_at: null,
  sent_at: null,
  resolved_by: null,
  created_at: '2026-10-11T09:00:00Z',
  ...over,
})
const ledger = (mode: 'fake' | 'live', pushes: LedgerPush[] = []): LedgerResponse => ({
  mode,
  batches: [
    {
      id: 'b1',
      created_at: '2026-10-11T09:00:00Z',
      agent_display_name: 'Dana Agent',
      mode,
      activity_state: 'sent',
      logics_activity_id: null,
      pushes,
    },
  ],
})

let root: Root | undefined
let container: HTMLDivElement

async function render(items: ReviewItem[], led: LedgerResponse = ledger('fake')) {
  vi.mocked(useReview).mockReturnValue({ data: { request: { id: 'r1', case_id: 'c1', status: 'x' }, items } } as never)
  vi.mocked(api.fetchLedger).mockResolvedValue(led)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <LogicsPushCard requestId='r1' caseId='c1' />
      </QueryClientProvider>
    )
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

const button = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement
const box = (label: string) => container.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement
const row = (id: string) => container.querySelector(`[data-push-row="${id}"]`) as HTMLElement
const click = (el: HTMLElement) =>
  act(async () => {
    el.click()
  })

beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }))
afterEach(() => {
  act(() => root?.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('LogicsPushCard', () => {
  it('shows the empty block when nothing is approved', async () => {
    await render([item({ status: 'submitted', documents: [doc('a', 1)] })])
    expect(container.textContent).toContain('Push to Logics')
    expect(container.textContent).toContain('Nothing approved yet')
    expect(container.textContent).toContain('Approve an item and its files appear here.')
  })

  it('lists ready files of approved items with their plan, and enables the button on selection', async () => {
    await render(ITEMS)
    expect([...container.querySelectorAll('[data-push-row]')].map((e) => e.getAttribute('data-push-row'))).toEqual([
      'small',
      'big',
    ])
    expect(row('small').textContent).toContain('Sends as 1 file')
    expect(row('big').textContent).toContain('Will split into about 2 parts')
    const pushButton = button('Push to Logics (simulated)')
    expect(pushButton.disabled).toBe(true)
    await click(box('Select small.pdf'))
    expect(pushButton.disabled).toBe(false)
  })

  it('labels the button without (simulated) in live mode', async () => {
    await render(ITEMS, ledger('live'))
    expect(button('Push to Logics')).toBeTruthy()
  })

  it('polls the ledger with pollInterval', async () => {
    await render(ITEMS)
    const options = vi.mocked(useQuery).mock.calls.map((c) => c[0]).find((o) => o.queryKey[0] === 'logics-ledger')
    expect(options?.queryKey).toEqual(['logics-ledger', 'r1'])
    expect(options?.refetchInterval).toBe(pollInterval)
  })

  it('shows a sent row with its id, Simulated and Already pushed, with no way to push it again', async () => {
    await render(ITEMS, ledger('fake', [push({})]))
    const r = row('small')
    expect(r.textContent).toContain('Sent')
    expect(r.textContent).toContain('#128346')
    expect(r.textContent).toContain('Simulated')
    expect(r.textContent).toContain('Already pushed')
    expect(box('Select small.pdf').disabled).toBe(true)
    expect(box('Push small.pdf again')).toBeNull()
    expect(r.textContent).not.toContain('Push again')
  })

  it('D-04: an unknown row cannot be selected or pushed again; only the decision dialog resolves it', async () => {
    await render(ITEMS, ledger('fake', [push({ state: 'unknown', logics_document_id: null })]))
    const r = row('small')
    expect(box('Select small.pdf').disabled).toBe(true)
    expect(box('Push small.pdf again')).toBeNull()
    expect(r.textContent).not.toContain('Already pushed')
    expect(button('Needs your decision')).toBeTruthy()
  })

  it('a failed row can be pushed again fresh', async () => {
    await render(ITEMS, ledger('fake', [push({ state: 'failed', logics_document_id: null, error_detail: 'Logics returned HTTP 500' })]))
    expect(box('Select small.pdf').disabled).toBe(false)
  })

  it('renders unknown as a decision button and split parts in order', async () => {
    await render(
      ITEMS,
      ledger('live', [
        push({ mode: 'live', state: 'unknown', logics_document_id: null }),
        push({ mode: 'live', id: 'p2', document_id: 'big', part_index: 0, part_count: 2, state: 'sent' }),
        push({ mode: 'live', id: 'p3', document_id: 'big', part_index: 1, part_count: 2, state: 'sending', logics_document_id: null }),
      ])
    )
    expect(button('Needs your decision')).toBeTruthy()
    const chips = [...row('big').querySelectorAll('[data-push-chip]')].map((c) => c.textContent)
    expect(chips[0]).toContain('part 1 of 2')
    expect(chips[1]).toContain('part 2 of 2')
    expect(row('big').querySelector('svg.animate-spin')).not.toBeNull()
    expect(row('big').textContent).not.toContain('Simulated')
  })

  it('shows the manual-compression copy on a failed row', async () => {
    const detail = 'This PDF is password-protected. Ask for an unlocked copy.'
    await render(
      ITEMS,
      ledger('fake', [push({ state: 'failed', logics_document_id: null, error_detail: detail, needs_manual_compression: true })])
    )
    expect(row('small').textContent).toContain(detail)
    expect(row('small').textContent).toContain('Compress it outside ResSpark and re-upload to the item')
    expect(button('Re-send')).toBeUndefined()
  })

  it('opens the sheet with the selection', async () => {
    await render(ITEMS, ledger('fake', [push({ document_id: 'big', state: 'unknown', logics_document_id: null })]))
    await click(box('Select small.pdf'))
    await click(button('Push to Logics (simulated)'))
    const sheet = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(sheet.textContent).toContain('Uploaded via ResSpark by Dana Agent — small.pdf')
  })

  it('opens the resolution dialog from an unknown chip', async () => {
    await render(ITEMS, ledger('fake', [push({ document_id: 'big', state: 'unknown', logics_document_id: null })]))
    await click(button('Needs your decision'))
    expect(document.body.textContent).toContain("Logics didn't confirm this file")
  })
})
