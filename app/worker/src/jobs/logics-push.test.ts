import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claimPush, getPushForJob, transitionPush, type PushJob, type PushRow } from '../db/logics-pushes'
import { createFakeLogicsClient } from '../integrations/logics/fixtures'
import type { FakeWriteOptions } from '../integrations/logics/write-types'
import { handleLogicsPushPart, type LogicsPushJob } from './logics-push'
import { finalizeBatchIfDone } from './logics-push-finalize'
import { ensureNormalized } from './logics-push-normalize'

vi.mock('../db/logics-pushes', () => ({ claimPush: vi.fn(), getPushForJob: vi.fn(), transitionPush: vi.fn() }))
vi.mock('./logics-push-normalize', () => ({ ensureNormalized: vi.fn() }))
vi.mock('./logics-push-finalize', () => ({ finalizeBatchIfDone: vi.fn() }))
vi.mock('../integrations/logics/config', () => ({ liveClientFromRow: vi.fn() }))
vi.mock('../db/integrations', () => ({ getIntegration: vi.fn() }))

const ENV = { LOGICS_MODE: 'fake', LOGICS_WRITE_ENABLED: 'true', LOGICS_TEST_CASE_IDS: '900001' } as unknown as Env
const row = { id: 'P1', batch_id: 'B1', state: 'sending' } as PushRow
const job = {
  ...row,
  mode: 'fake',
  logics_case_id: 900001,
  file_name: 'stmt.pdf',
  part_index: 0,
  part_count: 1,
  agent_display_name: 'Dana Agent',
  file_category_id: null,
} as unknown as PushJob
const part = { fileName: 'stmt.pdf', bytes: new Uint8Array([1, 2, 3]), sha256: 'h', partIndex: 0, partCount: 1 }

const message = () =>
  ({ body: { type: 'logics_push', provider: 'logics', ref: 'P1' }, ack: vi.fn(), retry: vi.fn(), attempts: 1 }) as unknown as Message<LogicsPushJob> & {
    ack: ReturnType<typeof vi.fn>
    retry: ReturnType<typeof vi.fn>
  }
const fake = (outcome: FakeWriteOptions['outcome'] = 'sent') => () => createFakeLogicsClient({ outcome, delayMs: 0 })
const run = async (env = ENV, opts = { clientFactory: fake() }) => {
  const msg = message()
  await handleLogicsPushPart(msg, env, opts)
  return msg
}
const lastTransition = () => vi.mocked(transitionPush).mock.calls.at(-1)?.[1]

beforeEach(() => {
  vi.mocked(claimPush).mockResolvedValue(row)
  vi.mocked(getPushForJob).mockResolvedValue(job)
  vi.mocked(ensureNormalized).mockResolvedValue({ ok: true, part })
  vi.mocked(transitionPush).mockResolvedValue(true)
})
afterEach(() => vi.clearAllMocks())

describe('handleLogicsPushPart: refused claim', () => {
  it('a still-queued row is retried in 30 s and never acked', async () => {
    vi.mocked(claimPush).mockResolvedValue(null)
    vi.mocked(getPushForJob).mockResolvedValue({ ...job, state: 'queued' })
    const msg = await run()
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 30 })
    expect(msg.ack).not.toHaveBeenCalled()
    expect(transitionPush).not.toHaveBeenCalled()
  })

  it('a terminal row is acked once and never retried', async () => {
    vi.mocked(claimPush).mockResolvedValue(null)
    vi.mocked(getPushForJob).mockResolvedValue({ ...job, state: 'sent' })
    const msg = await run()
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
  })
})

describe('handleLogicsPushPart: pre-dispatch failures after the claim', () => {
  it('the write guard refusing marks the row failed logics_write_blocked and acks', async () => {
    const msg = await run({ ...ENV, LOGICS_TEST_CASE_IDS: '1' })
    expect(lastTransition()).toMatchObject({ from: 'sending', to: 'failed', errorCode: 'logics_write_blocked' })
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
    expect(ensureNormalized).not.toHaveBeenCalled()
  })

  it('a mode switch since queueing marks the row failed mode_changed and acks', async () => {
    const msg = await run({ ...ENV, LOGICS_MODE: 'live' })
    expect(lastTransition()).toMatchObject({ to: 'failed', errorCode: 'mode_changed' })
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
  })

  it('a file that cannot be shrunk is failed with needs_manual_compression and staff copy, never sent', async () => {
    vi.mocked(ensureNormalized).mockResolvedValue({ ok: false, code: 'pdf_page_too_large', detail: 'copy', manual: true })
    const send = vi.fn()
    const msg = await run(ENV, { clientFactory: () => ({ ...createFakeLogicsClient(), createCaseDocument: send }) })
    expect(lastTransition()).toMatchObject({ to: 'failed', errorCode: 'pdf_page_too_large', needsManual: true, errorDetail: 'copy' })
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(finalizeBatchIfDone).toHaveBeenCalledTimes(1)
  })

  it('a Storage read error is failed storage_read_failed, acked once, never retried', async () => {
    vi.mocked(ensureNormalized).mockResolvedValue({ ok: false, code: 'storage_read_failed', detail: 'x', manual: false })
    const msg = await run()
    expect(lastTransition()).toMatchObject({ from: 'sending', to: 'failed', errorCode: 'storage_read_failed', needsManual: false })
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
    expect(finalizeBatchIfDone).toHaveBeenCalledTimes(1)
  })
})

describe('handleLogicsPushPart: ack after dispatch', () => {
  it('sent: transitions with the Logics id and acks once', async () => {
    const msg = await run()
    expect(lastTransition()).toMatchObject({ from: 'sending', to: 'sent' })
    expect(lastTransition()?.logicsDocumentId).toBeGreaterThan(0)
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
    expect(finalizeBatchIfDone).toHaveBeenCalledTimes(1)
  })

  it('unknown (5xx / no response): transitions unknown and acks once', async () => {
    const msg = await run(ENV, { clientFactory: fake('unknown') })
    expect(lastTransition()).toMatchObject({ to: 'unknown', errorCode: 'logics_no_response' })
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
    expect(finalizeBatchIfDone).toHaveBeenCalledTimes(1)
  })

  it('auth (4xx): transitions failed logics_auth and acks once', async () => {
    const msg = await run(ENV, { clientFactory: fake('auth') })
    expect(lastTransition()).toMatchObject({ to: 'failed', errorCode: 'logics_auth', errorDetail: 'Logics returned HTTP 401' })
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
    expect(finalizeBatchIfDone).toHaveBeenCalledTimes(1)
  })

  it('a runtime throw mid-dispatch is acked once and recorded unknown logics_no_response', async () => {
    const throwing = () => ({ ...createFakeLogicsClient(), createCaseDocument: vi.fn().mockRejectedValue(new TypeError('boom')) })
    const msg = await run(ENV, { clientFactory: throwing })
    expect(lastTransition()).toMatchObject({ from: 'sending', to: 'unknown', errorCode: 'logics_no_response' })
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
    expect(finalizeBatchIfDone).toHaveBeenCalledTimes(1)
  })
})
