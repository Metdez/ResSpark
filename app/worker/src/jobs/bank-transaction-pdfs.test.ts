import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccountCells, listAccountMonthTransactions, listConnectionAccountRows, setMonthCell, type AccountCell } from '../db/bank'
import type { ConnectionRow } from '../db/connections'
import { renderTransactionStatement } from '../pdf/transactions-statement'
import { storeProviderFile } from '../storage/connection-files'
import { generateTransactionPdfs } from './bank-transaction-pdfs'

// Database, storage and the PDF render are mocked; the window rule and the file naming are what is tested.
vi.mock('../db/bank')
vi.mock('../storage/connection-files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/connection-files')>()),
  storeProviderFile: vi.fn(),
}))
vi.mock('../pdf/transactions-statement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pdf/transactions-statement')>()),
  renderTransactionStatement: vi.fn(),
}))

const env = {} as Env
const NOW = new Date('2026-10-10T12:00:00Z') // window: Sep 2026 back to Apr 2026
const conn = { id: 'CONN', firm_id: 'F', case_id: 'C', request_item_id: 'RI', data: {} } as unknown as ConnectionRow
const cell = (month: number, status: AccountCell['status'], document_id: string | null = null): AccountCell => ({ year: 2026, month, status, document_id })
const txn = (over: Partial<Awaited<ReturnType<typeof listAccountMonthTransactions>>[number]> = {}) => ({
  date: '2026-09-02',
  name: 'Coffee',
  merchant_name: null,
  amount: 4.5,
  pending: false,
  ...over,
})
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listConnectionAccountRows).mockResolvedValue([{ id: 'A1', external_account_id: 'ext-1', mask: '1234', name: 'Checking' }])
  vi.mocked(listAccountMonthTransactions).mockResolvedValue([txn()])
  vi.mocked(renderTransactionStatement).mockResolvedValue(PDF)
  vi.mocked(storeProviderFile).mockResolvedValue({ document_id: 'DOC1', created: true, storage_key: 'k' })
})

describe('generateTransactionPdfs', () => {
  it('skips cells with a document, non-fallback statuses and months outside the window', async () => {
    vi.mocked(getAccountCells).mockResolvedValue([
      cell(9, 'not_supported', 'D9'),
      cell(8, 'available'),
      cell(7, 'manual'),
      cell(6, 'pending'),
      cell(3, 'missing'), // March 2026 is month 7 of the window: outside
    ])
    expect(await generateTransactionPdfs(env, conn, NOW)).toEqual({ generated: 0 })
    expect(listAccountMonthTransactions).not.toHaveBeenCalled()
    expect(storeProviderFile).not.toHaveBeenCalled()
    expect(setMonthCell).not.toHaveBeenCalled()
  })

  it('skips a month with no settled transactions', async () => {
    vi.mocked(getAccountCells).mockResolvedValue([cell(9, 'not_supported'), cell(8, 'missing')])
    vi.mocked(listAccountMonthTransactions).mockResolvedValueOnce([]).mockResolvedValueOnce([txn({ pending: true })])
    expect(await generateTransactionPdfs(env, conn, NOW)).toEqual({ generated: 0 })
    expect(storeProviderFile).not.toHaveBeenCalled()
  })

  it('stores one labelled PDF per fallback month and attaches it without changing the cell status', async () => {
    vi.mocked(getAccountCells).mockResolvedValue([cell(9, 'not_supported'), cell(7, 'missing')])
    vi.mocked(listAccountMonthTransactions).mockResolvedValue([txn({ pending: true }), txn({ amount: -200, date: '2026-09-15' })])
    expect(await generateTransactionPdfs(env, conn, NOW)).toEqual({ generated: 2 })

    expect(listAccountMonthTransactions).toHaveBeenCalledWith(env, 'A1', 2026, 9)
    expect(listAccountMonthTransactions).toHaveBeenCalledWith(env, 'A1', 2026, 7)
    expect(storeProviderFile).toHaveBeenCalledTimes(2)
    const first = vi.mocked(storeProviderFile).mock.calls[0][1]
    expect(first).toMatchObject({
      conn,
      kind: 'bank',
      group: '1234',
      name: '2026-09-transactions.pdf',
      displayName: 'Transactions - September 2026 - x1234.pdf',
      mime: 'application/pdf',
      document_type: 'bank_transactions',
      actor: 'provider:resspark',
    })
    // The loader renders only the settled rows and hands storage a PDF ArrayBuffer.
    const bytes = await (first.bytes as () => Promise<ArrayBuffer>)()
    expect(bytes).toBeInstanceOf(ArrayBuffer)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(renderTransactionStatement).toHaveBeenCalledWith({
      accountName: 'Checking',
      mask: '1234',
      year: 2026,
      month: 9,
      transactions: [txn({ amount: -200, date: '2026-09-15' })],
    })
    expect(vi.mocked(storeProviderFile).mock.calls[1][1]).toMatchObject({ name: '2026-07-transactions.pdf', displayName: 'Transactions - July 2026 - x1234.pdf' })
    expect(setMonthCell).toHaveBeenCalledWith(env, 'A1', 2026, 9, 'not_supported', 'DOC1')
    expect(setMonthCell).toHaveBeenCalledWith(env, 'A1', 2026, 7, 'missing', 'DOC1')
  })

  it('groups by the external account id and omits the mask suffix when the account has no mask', async () => {
    vi.mocked(listConnectionAccountRows).mockResolvedValue([{ id: 'A2', external_account_id: 'ext-2', mask: null, name: null }])
    vi.mocked(getAccountCells).mockResolvedValue([cell(9, 'not_supported')])
    await generateTransactionPdfs(env, conn, NOW)
    const stored = vi.mocked(storeProviderFile).mock.calls[0][1]
    expect(stored).toMatchObject({ group: 'ext-2', displayName: 'Transactions - September 2026.pdf' })
    await (stored.bytes as () => Promise<ArrayBuffer>)()
    expect(renderTransactionStatement).toHaveBeenCalledWith(expect.objectContaining({ accountName: null, mask: null }))
  })
})
