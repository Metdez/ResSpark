import { button, cleanup, click, renderWithQuery, waitFor } from '@/test-utils/query-render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_TEXT } from '@/lib/consent-text'
import { PortalError, type PortalStep } from '../portal-api'
import type { ItemConnection } from './connection-api'
import { PayrollStep } from './payroll-step'
import { itemConnectionQuery } from './use-item-connection'

const m = vi.hoisted(() => ({
  getItemConnection: vi.fn(),
  recordConsent: vi.fn(),
  startConnection: vi.fn(),
  reconcileConnection: vi.fn(),
  loadTruvBridge: vi.fn(),
  init: vi.fn(),
  open: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('./connection-api', () => ({
  getItemConnection: m.getItemConnection,
  recordConsent: m.recordConsent,
  startConnection: m.startConnection,
  reconcileConnection: m.reconcileConnection,
}))
vi.mock('./use-truv-bridge', () => ({ loadTruvBridge: m.loadTruvBridge }))
vi.mock('sonner', () => ({ toast: { error: m.toastError } }))
vi.mock('@/features/uploads/upload-sheet', () => ({
  UploadSheet: ({ item }: { item: { id: string } }) => <div data-testid='upload-sheet'>{item.id}</div>,
}))

const STEP: PortalStep = {
  id: 'I1',
  position: 2,
  kind: 'payroll_connect',
  label: 'Connect your payroll',
  required: true,
  status: 'pending',
}
const conn = (over: Partial<ItemConnection> = {}): ItemConnection => ({
  provider: { id: 'truv', configured: true, capabilities: null },
  consented: false,
  connection: null,
  ...over,
})
const view = (status: string, employers: unknown[] = [], error_code: string | null = null) =>
  ({ id: 'C1', status, error_code, accounts: [], employers }) as ItemConnection['connection']

const text = () => document.body.textContent ?? ''
const sheetText = () => document.querySelector('[role="dialog"]')?.textContent ?? ''

async function render(data: ItemConnection) {
  m.getItemConnection.mockResolvedValue(data)
  await renderWithQuery(<PayrollStep step={STEP} firmName='ValorTax' open onClose={() => {}} />, {})
  await waitFor(() => document.querySelector('[data-connect-message]') !== null)
}

beforeEach(() => {
  m.recordConsent.mockResolvedValue(undefined)
  m.startConnection.mockResolvedValue({ connection_id: 'C1', bridge_token: 'bt_1' })
  m.reconcileConnection.mockResolvedValue(undefined)
  m.init.mockReturnValue({ open: m.open, close: vi.fn() })
  m.loadTruvBridge.mockResolvedValue({ init: m.init })
})
afterEach(cleanup)

describe('PayrollStep', () => {
  it('fresh: Connect payroll (44 px), the upload fallback, and no vendor name', async () => {
    await render(conn())
    expect(button('Connect payroll')!.className).toContain('h-11')
    expect(button('Upload pay stubs instead')).toBeDefined()
    expect(text()).not.toMatch(/truv|plaid/i)
  })

  it('Connect opens the consent sheet without loading Bridge', async () => {
    await render(conn())
    await click(button('Connect payroll')!)
    expect(sheetText()).toContain(CONSENT_TEXT.payroll_data.title)
    expect(m.loadTruvBridge).not.toHaveBeenCalled()
  })

  it('I agree → consent, start, load, init(order, token), open — in that order', async () => {
    await render(conn())
    await click(button('Connect payroll')!)
    await click(button('I agree')!)
    await waitFor(() => m.open.mock.calls.length === 1)
    expect(m.recordConsent).toHaveBeenCalledWith('payroll_data')
    expect(m.startConnection).toHaveBeenCalledWith('payroll', 'I1')
    expect(m.init).toHaveBeenCalledWith(expect.objectContaining({ isOrder: true, bridgeToken: 'bt_1' }))
    const order = [m.recordConsent, m.startConnection, m.loadTruvBridge, m.init, m.open].map(
      (f) => f.mock.invocationCallOrder[0]
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('order COMPLETED and close reconcile; bridge SUCCESS does not', async () => {
    await render(conn({ consented: true }))
    await click(button('Connect payroll')!)
    await waitFor(() => m.init.mock.calls.length === 1)
    const opts = m.init.mock.calls[0][0]
    opts.onEvent('SUCCESS', {}, 'bridge')
    expect(m.reconcileConnection).not.toHaveBeenCalled()
    opts.onEvent('COMPLETED', {}, 'order')
    expect(m.reconcileConnection).toHaveBeenCalledTimes(1)
    expect(m.reconcileConnection).toHaveBeenCalledWith('C1')
    opts.onClose()
    expect(m.reconcileConnection).toHaveBeenCalledTimes(2)
  })

  it('already consented: Connect skips the consent sheet', async () => {
    await render(conn({ consented: true }))
    await click(button('Connect payroll')!)
    await waitFor(() => m.open.mock.calls.length === 1)
    expect(m.recordConsent).not.toHaveBeenCalled()
    expect(text()).not.toContain(CONSENT_TEXT.payroll_data.title)
  })

  it('provider_not_configured on start switches to the not-configured state', async () => {
    m.startConnection.mockRejectedValue(new PortalError(503, 'provider_not_configured'))
    await render(conn({ consented: true }))
    await click(button('Connect payroll')!)
    await waitFor(() => text().includes("Your agent's payroll connection isn't set up yet. Upload your pay stubs instead."))
    expect(button('Connect payroll')).toBeUndefined()
    expect(button('Upload pay stubs instead')).toBeDefined()
  })

  it('a Bridge load failure shows the window copy', async () => {
    m.loadTruvBridge.mockRejectedValue(new Error('bridge_load_failed'))
    await render(conn({ consented: true }))
    await click(button('Connect payroll')!)
    await waitFor(() => m.toastError.mock.calls.length === 1)
    expect(m.toastError).toHaveBeenCalledWith(
      "The payroll window couldn't open. Try again, or upload your pay stubs instead."
    )
  })

  it('pending: Finishing up… and Add another employer', async () => {
    await render(conn({ consented: true, connection: view('pending') }))
    expect(text()).toContain('Finishing up…')
    expect(button('Add another employer')!.className).toContain('h-11')
  })

  it('done: every employer with its counts and the done copy', async () => {
    await render(
      conn({
        connection: view('done', [
          { company_name: 'Acme Inc', status: 'done', pay_stubs: 2, w2s: 1 },
          { company_name: 'Beta LLC', status: 'done', pay_stubs: 1, w2s: 0 },
        ]),
      })
    )
    expect(text()).toContain('Acme Inc')
    expect(text()).toContain('Beta LLC')
    expect(text()).toContain('2 pay stubs · 1 W-2')
    expect(text()).toContain('1 pay stub')
    expect(text()).not.toContain('1 pay stub ·')
    expect(text()).toContain('Done. Your agent has what they need.')
  })

  it('error order_expired: the expired copy and no Bridge call', async () => {
    await render(conn({ connection: view('error', [], 'order_expired') }))
    expect(text()).toContain('This request expired. Ask your agent to send a new link.')
    expect(m.loadTruvBridge).not.toHaveBeenCalled()
  })

  it('Upload pay stubs instead opens UploadSheet for this item', async () => {
    await render(conn())
    await click(button('Upload pay stubs instead')!)
    await waitFor(() => document.querySelector('[data-testid="upload-sheet"]') !== null)
    expect(document.querySelector('[data-testid="upload-sheet"]')!.textContent).toBe('I1')
  })

  it('polls every 5 s while pending and stops when done', () => {
    const interval = itemConnectionQuery('I1', true).refetchInterval as (q: unknown) => number | false
    const q = (status: string) => ({ state: { data: conn({ connection: view(status) }) } })
    expect(interval(q('pending'))).toBe(5000)
    expect(interval(q('done'))).toBe(false)
    const closed = itemConnectionQuery('I1', false).refetchInterval as (q: unknown) => number | false
    expect(closed(q('pending'))).toBe(false)
  })
})
