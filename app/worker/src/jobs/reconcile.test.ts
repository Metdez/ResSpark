import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getConnection, recordConnectionEvent, updateConnection, type ConnectionRow } from '../db/connections'
import { reconcileBank } from './bank-reconcile'
import { reconcilePayroll } from './payroll-reconcile'
import { reconcileConnection } from './reconcile'
import { reconcileSignature } from './signature-reconcile'

vi.mock('../db/connections', () => ({
  getConnection: vi.fn(),
  updateConnection: vi.fn(),
  recordConnectionEvent: vi.fn(),
  findConnectionByEmployerLink: vi.fn(),
  findConnectionByExternalId: vi.fn(),
  findConnectionByLinkRef: vi.fn(),
}))
vi.mock('./bank-reconcile', () => ({ reconcileBank: vi.fn() }))
vi.mock('./payroll-reconcile', () => ({ reconcilePayroll: vi.fn() }))
vi.mock('./signature-reconcile', () => ({ reconcileSignature: vi.fn() }))

const send = vi.fn()
const env = { JOBS: { send } } as unknown as Env
const conn = (kind: string) => ({ id: 'K1', case_id: 'CASE1', kind, status: 'syncing' }) as unknown as ConnectionRow
const JOB = { type: 'financials_propose', ref: 'CASE1', reason: 'connection_done' }

describe('reconcileConnection -> financials_propose', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateConnection).mockResolvedValue()
    vi.mocked(recordConnectionEvent).mockResolvedValue()
    send.mockResolvedValue(undefined)
  })

  it.each(['payroll', 'bank'])('%s reaching done (applied) enqueues one job for the case', async (kind) => {
    vi.mocked(getConnection).mockResolvedValue(conn(kind))
    vi.mocked(kind === 'payroll' ? reconcilePayroll : reconcileBank).mockResolvedValue({ status: 'done', applied: true })
    expect(await reconcileConnection(env, 'K1', { source: 'cron' })).toEqual({ status: 'done', applied: true })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(JOB)
    expect(updateConnection).toHaveBeenCalledWith(env, 'K1', { last_polled_at: expect.any(String) })
  })

  it('done but not applied (an equal-status no-op) sends nothing', async () => {
    vi.mocked(getConnection).mockResolvedValue(conn('payroll'))
    vi.mocked(reconcilePayroll).mockResolvedValue({ status: 'done', applied: false })
    await reconcileConnection(env, 'K1', { source: 'cron' })
    expect(send).not.toHaveBeenCalled()
  })

  it('connected sends nothing', async () => {
    vi.mocked(getConnection).mockResolvedValue(conn('bank'))
    vi.mocked(reconcileBank).mockResolvedValue({ status: 'connected', applied: true })
    await reconcileConnection(env, 'K1', { source: 'cron' })
    expect(send).not.toHaveBeenCalled()
  })

  it('a signature connection never enqueues financials', async () => {
    vi.mocked(getConnection).mockResolvedValue(conn('signature'))
    vi.mocked(reconcileSignature).mockResolvedValue({ status: 'done', applied: true })
    await reconcileConnection(env, 'K1', { source: 'cron' })
    expect(send).not.toHaveBeenCalled()
  })

  it('a throwing JOBS.send is recorded and the reconcile still resolves', async () => {
    vi.mocked(getConnection).mockResolvedValue(conn('bank'))
    vi.mocked(reconcileBank).mockResolvedValue({ status: 'done', applied: true })
    send.mockRejectedValue(new Error('queue down'))
    vi.mocked(recordConnectionEvent).mockRejectedValue(new Error('db down'))
    expect(await reconcileConnection(env, 'K1', { source: 'cron' })).toEqual({ status: 'done', applied: true })
    expect(recordConnectionEvent).toHaveBeenCalledWith(env, 'K1', 'connection.enqueue_failed', { reason: 'connection_done' }, { type: 'system' })
  })
})
