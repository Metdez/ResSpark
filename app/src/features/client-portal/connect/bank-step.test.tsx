import { button, cleanup, click, renderWithQuery, waitFor } from '@/test-utils/query-render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalError, type PortalStep } from '../portal-api'
import { BankStep } from './bank-step'
import type { ItemConnection } from './connection-api'
import { itemConnectionQuery } from './use-item-connection'

const m = vi.hoisted(() => ({
  getItemConnection: vi.fn(),
  recordConsent: vi.fn(),
  startConnection: vi.fn(),
  attributeStatement: vi.fn(),
  listItemDocuments: vi.fn(),
  assign: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('./connection-api', () => ({
  getItemConnection: m.getItemConnection,
  recordConsent: m.recordConsent,
  startConnection: m.startConnection,
  attributeStatement: m.attributeStatement,
}))
vi.mock('@/features/uploads/api', () => ({ listItemDocuments: m.listItemDocuments }))
vi.mock('sonner', () => ({ toast: { error: m.toastError } }))
vi.mock('@/features/uploads/upload-sheet', () => ({
  UploadSheet: ({ item, onClose }: { item: { id: string }; onClose(): void }) => (
    <div data-testid='upload-sheet'>
      {item.id}
      <button onClick={onClose}>close upload</button>
    </div>
  ),
}))

const STEP: PortalStep = { id: 'I2', position: 1, kind: 'bank_connect', label: 'Connect your bank', required: true, status: 'pending' }
const CAPS = { transactions: true, statementPdfs: true, hostedLink: true }
const conn = (over: Partial<ItemConnection> = {}, caps: Partial<typeof CAPS> = {}): ItemConnection => ({
  provider: { id: 'plaid', configured: true, capabilities: { ...CAPS, ...caps } },
  consented: false,
  connection: null,
  ...over,
})
const view = (status: string, error_code: string | null = null, accounts: unknown[] = []) =>
  ({ id: 'C1', status, error_code, accounts, employers: [] }) as ItemConnection['connection']
const ACCOUNT = {
  id: 'A1',
  mask: '0000',
  name: 'Plaid Checking',
  months: [
    { year: 2026, month: 4, status: 'available' },
    { year: 2026, month: 9, status: 'available' },
    { year: 2026, month: 8, status: 'manual' },
    { year: 2026, month: 7, status: 'pending' },
    { year: 2026, month: 6, status: 'missing' },
    { year: 2026, month: 5, status: 'not_supported' },
  ],
}

const text = () => document.body.textContent ?? ''
const message = () => document.querySelector('[data-connect-message]')?.textContent
const mark = () => document.querySelector('[data-provider-mark]')
const uploadStub = () => document.querySelector('[data-testid="upload-sheet"]')

async function render(data: ItemConnection, step: PortalStep = STEP) {
  m.getItemConnection.mockResolvedValue(data)
  await renderWithQuery(<BankStep step={step} firmName='ValorTax' open onClose={() => {}} />, {})
  await waitFor(() => message() !== undefined)
}

beforeEach(() => {
  vi.stubGlobal('location', { ...window.location, assign: m.assign })
  m.recordConsent.mockResolvedValue(undefined)
  m.startConnection.mockResolvedValue({ connection_id: 'C1', hosted_link_url: 'https://secure.plaid.com/hl/x' })
  m.attributeStatement.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('BankStep states', () => {
  it('fresh with every capability: intro, 44 px Connect bank, the upload fallback, and the Plaid trust line', async () => {
    await render(conn())
    expect(message()).toBe("Connect the bank you use most. We'll gather up to 6 months of transactions and statements.")
    expect(button('Connect bank')!.className).toContain('h-11')
    expect(button('Upload statements instead')).toBeDefined()
    expect(mark()?.textContent).toBe('Secure connection powered by Plaid')
  })

  it('Connect → consent (bank wording) → I agree → consent, start, same-tab hosted link', async () => {
    await render(conn())
    await click(button('Connect bank')!)
    expect(text()).toContain('Before we connect your bank')
    expect(text()).toContain('We never see your bank password.')
    await click(button('I agree')!)
    await waitFor(() => m.assign.mock.calls.length === 1)
    expect(m.recordConsent).toHaveBeenCalledWith('bank_data')
    expect(m.startConnection).toHaveBeenCalledWith('bank', 'I2')
    expect(m.assign).toHaveBeenCalledWith('https://secure.plaid.com/hl/x')
  })

  it('not configured: the not-configured copy and only the upload button', async () => {
    await render(conn({ provider: { id: null, configured: false, capabilities: null } }))
    expect(message()).toBe("Your agent's bank connection isn't set up yet. Upload your statements instead.")
    expect(button('Connect bank')).toBeUndefined()
    const buttons = [...document.querySelectorAll('[role="dialog"] button')]
    expect(buttons[0].textContent).toBe('Upload statements instead')
    expect(mark()).toBeNull()
  })

  it('no statement PDFs: the transactions-only intro', async () => {
    await render(conn({}, { statementPdfs: false }))
    expect(message()).toContain("you'll add the statements yourself below")
  })

  it('no hosted link: not available and no connect button', async () => {
    await render(conn({}, { hostedLink: false }))
    expect(message()).toBe("Connecting this bank isn't available yet. Upload your statements instead.")
    expect(button('Connect bank')).toBeUndefined()
  })

  it('pending: checking copy', async () => {
    await render(conn({ connection: view('pending') }))
    expect(message()).toBe('Checking your connection…')
  })

  it('connected and syncing: the history copy', async () => {
    await render(conn({ connection: view('syncing') }))
    expect(message()).toContain('Bank connected. Your bank is sending the history')
    cleanup()
    await render(conn({ connection: view('connected') }))
    expect(message()).toContain('Bank connected. Your bank is sending the history')
  })

  it('error ITEM_LOGIN_REQUIRED: the sign-in copy and Connect bank again', async () => {
    await render(conn({ connection: view('error', 'ITEM_LOGIN_REQUIRED') }))
    expect(message()).toBe('Your bank asked you to sign in again. Connect your bank again.')
    expect(button('Connect bank')).toBeDefined()
  })

  it('done: the done copy', async () => {
    await render(conn({ connection: view('done') }))
    expect(message()).toBe('Done. Your agent has what they need.')
  })

  it('polls every 5 s while syncing and stops when done', () => {
    const interval = itemConnectionQuery('I2', true).refetchInterval as (q: unknown) => number | false
    const q = (status: string) => ({ state: { data: conn({ connection: view(status) }) } })
    expect(interval(q('syncing'))).toBe(5000)
    expect(interval(q('done'))).toBe(false)
  })

  it('provider_not_configured on start switches to the not-configured copy', async () => {
    m.startConnection.mockRejectedValue(new PortalError(503, 'provider_not_configured'))
    await render(conn({ consented: true }))
    await click(button('Connect bank')!)
    await waitFor(() => message() === "Your agent's bank connection isn't set up yet. Upload your statements instead.")
    expect(m.assign).not.toHaveBeenCalled()
  })
})

describe('BankStep statement months', () => {
  const withAccount = () => conn({ connection: view('syncing', null, [ACCOUNT]) })
  const rows = () => [...document.querySelectorAll<HTMLElement>('[data-month-cell]')]

  it('six rows newest first with Received, Checking…, and upload buttons', async () => {
    await render(withAccount())
    expect(text()).toContain('Plaid Checking ••0000')
    expect(rows().map((r) => r.firstElementChild!.textContent)).toEqual([
      'Sep 2026',
      'Aug 2026',
      'Jul 2026',
      'Jun 2026',
      'May 2026',
      'Apr 2026',
    ])
    expect(rows()[0].textContent).toContain('Received')
    expect(rows()[1].textContent).toContain('Received')
    expect(rows()[2].textContent).toContain('Checking…')
    expect(rows()[4].textContent).toContain('Not from this bank')
    for (const label of ['Upload your Jun 2026 statement for ••0000', 'Upload your May 2026 statement for ••0000'])
      expect(button(label)!.className).toContain('min-h-11')
    expect(rows().every((r) => r.className.includes('min-h-11'))).toBe(true)
  })

  it('a month upload attributes the new ready document once and skips older ones', async () => {
    await render(withAccount())
    const before = new Date(Date.now() - 60_000).toISOString()
    await click(button('Upload your Jun 2026 statement for ••0000')!)
    expect(uploadStub()!.textContent).toContain('I2')
    const after = new Date(Date.now() + 1_000).toISOString()
    m.listItemDocuments.mockResolvedValue({
      item: { id: 'I2', label: STEP.label, status: 'pending', rejection_note: null },
      documents: [
        { id: 'D0', name: 'old.pdf', mime: 'application/pdf', size_bytes: 1, status: 'ready', uploaded_at: before },
        { id: 'D1', name: 'jun.pdf', mime: 'application/pdf', size_bytes: 1, status: 'ready', uploaded_at: after },
      ],
    })
    const loads = m.getItemConnection.mock.calls.length
    await click(button('close upload')!)
    await waitFor(() => m.getItemConnection.mock.calls.length > loads)
    expect(m.attributeStatement).toHaveBeenCalledTimes(1)
    expect(m.attributeStatement).toHaveBeenCalledWith('C1', {
      document_id: 'D1',
      bank_account_id: 'A1',
      year: 2026,
      month: 6,
    })
  })

  it('month_available from attribution is swallowed', async () => {
    m.attributeStatement.mockRejectedValue(new PortalError(409, 'month_available'))
    await render(withAccount())
    await click(button('Upload your May 2026 statement for ••0000')!)
    m.listItemDocuments.mockResolvedValue({
      item: { id: 'I2', label: STEP.label, status: 'pending', rejection_note: null },
      documents: [{ id: 'D2', name: 'may.pdf', mime: 'application/pdf', size_bytes: 1, status: 'ready', uploaded_at: new Date(Date.now() + 1_000).toISOString() }],
    })
    const loads = m.getItemConnection.mock.calls.length
    await click(button('close upload')!)
    await waitFor(() => m.getItemConnection.mock.calls.length > loads)
    expect(m.toastError).not.toHaveBeenCalled()
  })

  it('Upload statements instead never attributes', async () => {
    await render(withAccount())
    await click(button('Upload statements instead')!)
    expect(uploadStub()).not.toBeNull()
    await click(button('close upload')!)
    expect(m.listItemDocuments).not.toHaveBeenCalled()
    expect(m.attributeStatement).not.toHaveBeenCalled()
  })
})

describe('BankStep polish', () => {
  // the vendored 16 px icon close (hidden by the sheet) is the dialog's last child
  const dialogButtons = () => {
    const dialog = document.querySelector('[role="dialog"]')!
    return [...dialog.querySelectorAll('button')].filter((b) => b !== dialog.lastElementChild)
  }

  it('a rejected step shows the note and makes the upload the primary action', async () => {
    m.listItemDocuments.mockResolvedValue({
      item: { id: 'I2', label: STEP.label, status: 'rejected', rejection_note: 'June is missing a page.' },
      documents: [],
    })
    await render(conn(), { ...STEP, status: 'rejected' })
    await waitFor(() => text().includes('Your agent asked for a new copy: June is missing a page.'))
    const labels = dialogButtons().map((b) => b.textContent)
    expect(labels.indexOf('Upload statements instead')).toBeLessThan(labels.indexOf('Connect bank'))
    expect(button('Upload statements instead')!.className).toContain('bg-primary')
  })

  it('stale consent reopens the consent sheet with a notice; agreeing again connects', async () => {
    m.startConnection
      .mockRejectedValueOnce(new PortalError(409, 'consent_required'))
      .mockResolvedValueOnce({ connection_id: 'C1', hosted_link_url: 'https://secure.plaid.com/hl/y' })
    await render(conn({ consented: true }))
    await click(button('Connect bank')!)
    await waitFor(() => text().includes('Please read and agree again.'))
    expect(m.toastError).not.toHaveBeenCalled()
    await click(button('I agree')!)
    await waitFor(() => m.assign.mock.calls.length === 1)
    expect(m.assign).toHaveBeenCalledWith('https://secure.plaid.com/hl/y')
  })

  it('every button in the sheet is 44 px', async () => {
    await render(conn({ connection: view('syncing', null, [ACCOUNT]) }))
    expect(dialogButtons().every((b) => /\b(min-)?h-11\b/.test(b.className))).toBe(true)
  })
})
