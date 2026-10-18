import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import * as reviewApi from '../api'
import type { AccountSummary, MonthCell } from './api'
import { StatementGrid } from './statement-grid'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), documentUrl: vi.fn() }))

const NOW = new Date('2026-10-10T12:00:00Z')
const m = (month: number, status: string, document_id: string | null = null): MonthCell => ({
  year: 2026,
  month,
  status,
  document_id,
})
const account = (over: Partial<AccountSummary>): AccountSummary => ({
  id: 'A1',
  mask: '0000',
  name: 'Checking',
  type: 'depository',
  subtype: 'checking',
  months: [
    m(9, 'available', 'D9'),
    m(8, 'manual', 'D8'),
    m(7, 'missing'),
    m(6, 'not_supported'),
    m(5, 'pending'),
    // April absent on purpose: renders Missing.
  ],
  ...over,
})

let root: Root | undefined
let container: HTMLDivElement

async function render(accounts: AccountSummary[]) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(<StatementGrid accounts={accounts} now={NOW} />))
}

const headRows = () => [...container.querySelectorAll('thead tr')]
const cells = (accountId = 'A1') =>
  [...container.querySelectorAll(`[data-account="${accountId}"] td`)].slice(1) as HTMLElement[]
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)))

beforeEach(() => {
  vi.mocked(reviewApi.documentUrl).mockResolvedValue({ url: 'https://s.test/x', expires_in: 300, disposition: 'inline' })
  vi.stubGlobal('open', vi.fn())
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('StatementGrid', () => {
  it('splits six newest-first months into Last 3 months and Months 4–6', async () => {
    await render([account({})])
    const groups = [...headRows()[0].querySelectorAll('th')].slice(1)
    expect(groups.map((g) => [g.textContent, g.getAttribute('colspan')])).toEqual([
      ['Last 3 months', '3'],
      ['Months 4–6', '3'],
    ])
    expect([...headRows()[1].querySelectorAll('th')].map((t) => t.textContent)).toEqual([
      'Sep 2026',
      'Aug 2026',
      'Jul 2026',
      'Jun 2026',
      'May 2026',
      'Apr 2026',
    ])
  })

  it('labels the account row with name and mask', async () => {
    await render([account({})])
    expect(container.querySelector('[data-account="A1"] td')!.textContent).toBe('Checking ••0000')
  })

  it('renders each cell from cellBadge, absent months as Missing', async () => {
    await render([account({})])
    expect(cells().map((c) => c.textContent)).toEqual([
      'Statement',
      'Uploaded',
      'Missing',
      'Not from bank',
      'Checking',
      'Missing',
    ])
  })

  it('opens an available statement through the signed-URL route with noopener', async () => {
    await render([account({})])
    const btn = container.querySelector('[aria-label="Open Sep 2026 statement"]') as HTMLButtonElement
    await act(async () => btn.click())
    await flush()
    expect(reviewApi.documentUrl).toHaveBeenCalledWith('D9', 'inline')
    expect(window.open).toHaveBeenCalledWith('https://s.test/x', '_blank', 'noopener')
  })

  it('opens a manual upload too, labelled as an upload', async () => {
    await render([account({})])
    const btn = container.querySelector('[aria-label="Open Aug 2026 upload"]') as HTMLButtonElement
    expect(btn.textContent).toBe('Uploaded')
    await act(async () => btn.click())
    await flush()
    expect(reviewApi.documentUrl).toHaveBeenCalledWith('D8', 'inline')
  })

  it('missing, not_supported and pending cells are not clickable', async () => {
    await render([account({})])
    expect(cells().map((c) => c.querySelector('button') !== null)).toEqual([true, true, false, false, false, false])
  })

  it('a not_supported or missing month with a generated document reads From transactions and opens it', async () => {
    await render([account({ months: [m(9, 'not_supported', 'G9'), m(8, 'missing', 'G8'), m(7, 'not_supported')] })])
    expect(cells().slice(0, 3).map((c) => c.textContent)).toEqual(['From transactions', 'From transactions', 'Not from bank'])
    const btn = container.querySelector('[aria-label="Open Sep 2026 transactions"]') as HTMLButtonElement
    await act(async () => btn.click())
    await flush()
    expect(reviewApi.documentUrl).toHaveBeenCalledWith('G9', 'inline')
    expect(container.querySelector('[aria-label="Open Aug 2026 transactions"]')).not.toBeNull()
  })

  it('lists the generated badge in the legend', async () => {
    await render([account({})])
    const legend = [...container.querySelector('[aria-label="Legend"]')!.children].map((b) => b.textContent)
    expect(legend).toEqual(['Statement', 'Uploaded', 'From transactions', 'Not from bank', 'Missing', 'Checking'])
  })

  it('keeps accounts in the given order', async () => {
    await render([account({ id: 'B', mask: '9999', name: 'Savings' }), account({ id: 'A1' })])
    expect([...container.querySelectorAll('[data-account]')].map((r) => r.getAttribute('data-account'))).toEqual([
      'B',
      'A1',
    ])
  })

  it('shows a toast when the signed URL fails', async () => {
    vi.mocked(reviewApi.documentUrl).mockRejectedValue(new ApiError(404, 'not_found', 'x'))
    await render([account({})])
    await act(async () => (container.querySelector('[aria-label="Open Sep 2026 statement"]') as HTMLElement).click())
    await flush()
    expect(window.open).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith("Couldn't open this file", { description: 'Try again in a moment. (not_found)' })
  })
})
