import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setConnectionStatus, updateConnection, type ConnectionRow } from '../db/connections'
import { getOrder, type TruvOrder } from '../integrations/truv/orders'
import { getIncomeReport, getLinkDocuments } from '../integrations/truv/reports'
import { storeProviderFile } from '../storage/connection-files'
import { reconcilePayroll } from './payroll-reconcile'

// PAY-04: expiry and partial-employer rules. Vendor reads, storage and status writes are mocked.
vi.mock('../db/connections')
vi.mock('../storage/connection-files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/connection-files')>()),
  storeProviderFile: vi.fn(),
}))
vi.mock('../integrations/truv/orders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../integrations/truv/orders')>()),
  getOrder: vi.fn(),
}))
vi.mock('../integrations/truv/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../integrations/truv/reports')>()),
  getIncomeReport: vi.fn(),
  getLinkDocuments: vi.fn(),
  truvDownload: vi.fn(),
}))

const env = {} as Env
const conn = { id: 'CONN', status: 'connected', external_id: 'ord_1', data: {} } as unknown as ConnectionRow
const order = (over: Partial<TruvOrder>): TruvOrder => ({ id: 'ord_1', is_expired: false, employers: [], ...over })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(setConnectionStatus).mockImplementation(async (_e, _id, status) => ({ applied: true, status, item_status: null, request_status: null }))
  vi.mocked(getIncomeReport).mockResolvedValue({ employments: [] })
  vi.mocked(getLinkDocuments).mockResolvedValue([])
})

describe('reconcilePayroll', () => {
  it('an expired order with work outstanding is error order_expired and reads no report', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      order({ is_expired: true, employers: [{ id: 'e1', status: 'pending', link_id: null }] })
    )
    const res = await reconcilePayroll(env, conn, { source: 'cron' })
    expect(res.status).toBe('error')
    expect(setConnectionStatus).toHaveBeenCalledWith(env, 'CONN', 'error', { code: 'order_expired' }, undefined)
    expect(getIncomeReport).not.toHaveBeenCalled()
  })
  it('an employer in error next to a completed one: the completed one is fetched, the connection ends done', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      order({
        employers: [
          { id: 'e1', status: 'error', link_id: 'link_bad', company: { name: 'Bad Co' } },
          { id: 'e2', status: 'completed', link_id: 'link_ok', company: { name: 'Good Co' } },
        ],
      })
    )
    const res = await reconcilePayroll(env, conn, { source: 'cron' })
    expect(res.status).toBe('done')
    expect(getIncomeReport).toHaveBeenCalledTimes(1)
    expect(getIncomeReport).toHaveBeenCalledWith(env, 'link_ok')
    const saved = vi.mocked(updateConnection).mock.calls.at(-1)![2].data as { employers: Array<Record<string, unknown>> }
    expect(saved.employers[0]).toMatchObject({ employer_id: 'e1', status: 'error' })
    expect(saved.employers[1]).toMatchObject({ employer_id: 'e2', status: 'done', pay_stubs: 0, w2s: 0, income_reports: 0 })
    expect(typeof saved.employers[1].fetched_at).toBe('string')
    expect(storeProviderFile).not.toHaveBeenCalled()
  })
  it('stores each employer file under its storage name with the human-readable display name', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      order({ employers: [{ id: 'e2', status: 'completed', link_id: 'link_ok', company: { name: 'Good Co' } }] })
    )
    vi.mocked(getIncomeReport).mockResolvedValue({
      employments: [{ statements: [{ pay_date: '2026-09-15', check_number: '1001', file: 'https://files.truv.test/stub.pdf', md5sum: null }] }],
    })
    await reconcilePayroll(env, conn, { source: 'cron' })
    expect(storeProviderFile).toHaveBeenCalledTimes(1)
    expect(storeProviderFile).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        kind: 'payroll',
        group: 'good-co-e2',
        name: 'paystub-2026-09-15-1001.pdf',
        displayName: 'Pay stub - September 15, 2026 - check 1001.pdf',
        document_type: 'pay_stub',
      })
    )
  })
})
