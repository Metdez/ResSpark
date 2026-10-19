import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './api'
import type { TransactionRow } from './api'
import { TransactionsTable } from './transactions-table'

vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), fetchTransactions: vi.fn() }))

const tx = (over: Partial<TransactionRow>): TransactionRow => ({
  id: 'T1',
  date: '2026-10-01',
  name: 'STARBUCKS 123',
  merchant_name: 'Starbucks',
  amount: 12.34,
  iso_currency_code: 'USD',
  category_primary: 'FOOD_AND_DRINK',
  category_detailed: 'FOOD_AND_DRINK_COFFEE',
  pending: false,
  ...over,
})
const ROWS = [tx({}), tx({ id: 'T2', merchant_name: null, name: 'Payroll deposit', amount: -1500, pending: true })]

let root: Root | undefined
let container: HTMLDivElement

const tick = () => act(async () => new Promise((r) => setTimeout(r, 0)))
const button = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement
const click = async (el: HTMLElement) => {
  await act(async () => el.click())
  await tick()
}

async function renderOpen() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <TransactionsTable connectionId='C1' />
      </QueryClientProvider>
    )
  )
  await click(button('Transactions'))
}

const rows = () => [...container.querySelectorAll<HTMLElement>('[data-transaction]')]

beforeEach(() => {
  vi.mocked(api.fetchTransactions).mockResolvedValue({ months: 6, total: 412, transactions: ROWS })
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('TransactionsTable', () => {
  it('fetches nothing while closed', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () =>
      root!.render(
        <QueryClientProvider client={new QueryClient()}>
          <TransactionsTable connectionId='C1' />
        </QueryClientProvider>
      )
    )
    await tick()
    expect(api.fetchTransactions).not.toHaveBeenCalled()
  })

  it('defaults to Last 6 months pressed and fetches 6', async () => {
    await renderOpen()
    expect(button('Last 6 months').getAttribute('aria-pressed')).toBe('true')
    expect(button('Last 3 months').getAttribute('aria-pressed')).toBe('false')
    expect(api.fetchTransactions).toHaveBeenCalledWith('C1', 6)
  })

  it('switching to Last 3 months fetches 3', async () => {
    await renderOpen()
    await click(button('Last 3 months'))
    expect(api.fetchTransactions).toHaveBeenCalledWith('C1', 3)
    expect(button('Last 3 months').getAttribute('aria-pressed')).toBe('true')
  })

  it('renders description, humanized category, and date with ISO title in server order', async () => {
    await renderOpen()
    expect(rows().map((r) => r.getAttribute('data-transaction'))).toEqual(['T1', 'T2'])
    const [date, desc, cat] = [...rows()[0].querySelectorAll('td')]
    expect(desc.textContent).toContain('Starbucks')
    expect(rows()[1].querySelectorAll('td')[1].textContent).toContain('Payroll deposit')
    expect(cat.textContent).toBe('Food and drink')
    expect(date.getAttribute('title')).toBe('2026-10-01')
  })

  it('formats amounts right-aligned with tabular numbers and inverted Plaid signs', async () => {
    await renderOpen()
    const amounts = rows().map((r) => r.querySelectorAll('td')[3])
    expect(amounts.map((a) => a.textContent)).toEqual(['−$12.34', '+$1,500.00'])
    expect(amounts[0].className).toContain('tabular-nums')
    expect(amounts[0].className).toContain('text-end')
  })

  it('shows a Pending chip only for pending rows and the footer count', async () => {
    await renderOpen()
    expect(rows()[0].textContent).not.toContain('Pending')
    expect(rows()[1].textContent).toContain('Pending')
    expect(container.textContent).toContain('Showing 2 of 412')
  })

  it('sums spending by category above the rows and skips pending ones', async () => {
    vi.mocked(api.fetchTransactions).mockResolvedValue({
      months: 6,
      total: 4,
      transactions: [
        ...ROWS,
        tx({ id: 'T3', amount: 1500, category_primary: 'RENT_AND_UTILITIES', category_detailed: 'RENT_AND_UTILITIES_RENT' }),
        tx({ id: 'T4', amount: -3000, category_primary: 'INCOME', category_detailed: 'INCOME_WAGES', name: 'ACME PAYROLL' }),
      ],
    })
    await renderOpen()
    const summary = container.querySelector('[data-spending-summary]')!
    expect(summary.textContent).toContain('Spending by category · last 6 months')
    const lines = [...summary.querySelectorAll<HTMLElement>('[data-spending-row]')].map((r) => r.getAttribute('data-spending-row'))
    expect(lines).toEqual(['income', 'Rent', 'Food and drink'])
    const rent = [...summary.querySelector('[data-spending-row="Rent"]')!.querySelectorAll('td')].map((c) => c.textContent)
    expect(rent).toEqual(['Rent', '1', '$1,500.00', '$250.00'])
    expect(summary.textContent).toContain('Settled transactions only.')
    expect(summary.textContent).not.toContain('from the rows shown below')
  })

  it('hides the summary when every row is pending or an inflow', async () => {
    vi.mocked(api.fetchTransactions).mockResolvedValue({ months: 6, total: 1, transactions: [ROWS[1]] })
    await renderOpen()
    expect(container.querySelector('[data-spending-summary]')).toBeNull()
  })

  it('shows three skeleton rows while loading', async () => {
    vi.mocked(api.fetchTransactions).mockReturnValue(new Promise(() => {}))
    await renderOpen()
    expect(container.querySelectorAll('[data-skeleton]')).toHaveLength(3)
  })

  it('shows the empty copy for no rows', async () => {
    vi.mocked(api.fetchTransactions).mockResolvedValue({ months: 6, total: 0, transactions: [] })
    await renderOpen()
    expect(container.textContent).toContain('No transactions yet')
  })
})
