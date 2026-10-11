import { afterEach, describe, expect, it, vi } from 'vitest'
import { finalizeBatch, recordBatchActivity, type BatchRow } from '../db/logics-pushes'
import { buildActivityComment, finalizeBatchIfDone } from './logics-push-finalize'

vi.mock('../db/logics-pushes', () => ({ finalizeBatch: vi.fn(), recordBatchActivity: vi.fn() }))

const ENV = {} as Env
const A = '0f9e8d7c-1111-4222-8333-444455556666'
const B = 'aaaa1111-1111-4222-8333-444455556666'
const W = 'bbbb2222-1111-4222-8333-444455556666'
const batch = { id: 'b1', logics_case_id: 900001, activity_type: 'Document sent', agent_display_name: 'Dana Agent' } as BatchRow
const part = (file_name: string, document_id: string, part_index = 0, part_count: number | null = 1) => ({
  file_name,
  part_index,
  part_count,
  document_id,
})

afterEach(() => {
  vi.mocked(finalizeBatch).mockReset()
  vi.mocked(recordBatchActivity).mockReset()
})

describe('buildActivityComment', () => {
  it('lists split and single parts with the rs: reference', () => {
    expect(buildActivityComment('Dana Agent', [part('stmt.pdf', A, 0, 2), part('stmt.pdf', A, 1, 2), part('id.pdf', B)], [])).toBe(
      'Documents uploaded via ResSpark by Dana Agent: stmt.pdf (part 1 of 2) rs:0f9e8d7c, stmt.pdf (part 2 of 2) rs:0f9e8d7c, id.pdf rs:aaaa1111'
    )
  })

  it('adds the unconfirmed line for unknown parts', () => {
    const text = buildActivityComment('Dana Agent', [part('id.pdf', B)], [part('w2.pdf', W)])
    expect(text.endsWith('\nUnconfirmed (check case documents): w2.pdf rs:bbbb2222')).toBe(true)
  })

  it('caps the comment at 4,000 characters ending in an ellipsis', () => {
    const text = buildActivityComment('Dana Agent', [part('x'.repeat(5_000) + '.pdf', A)], [])
    expect(text).toHaveLength(4_000)
    expect(text.endsWith('…')).toBe(true)
  })
})

describe('finalizeBatchIfDone', () => {
  const client = { createActivity: vi.fn() }
  afterEach(() => client.createActivity.mockReset())

  it('does nothing when another caller won or parts are still open', async () => {
    vi.mocked(finalizeBatch).mockResolvedValue(null)
    await finalizeBatchIfDone(ENV, 'b1', client)
    expect(client.createActivity).not.toHaveBeenCalled()
    expect(recordBatchActivity).not.toHaveBeenCalled()
  })

  it('posts nothing for an all-failed (skipped) batch', async () => {
    vi.mocked(finalizeBatch).mockResolvedValue({ batch, sent: [], unknown: [], all_failed: true })
    await finalizeBatchIfDone(ENV, 'b1', client)
    expect(client.createActivity).not.toHaveBeenCalled()
    expect(recordBatchActivity).not.toHaveBeenCalled()
  })

  it('posts one note with the batch activity type and records the ActivityID', async () => {
    vi.mocked(finalizeBatch).mockResolvedValue({ batch, sent: [part('id.pdf', B)], unknown: [], all_failed: false })
    client.createActivity.mockResolvedValue({ kind: 'sent', activityId: 9164821 })
    await finalizeBatchIfDone(ENV, 'b1', client)
    expect(client.createActivity).toHaveBeenCalledTimes(1)
    expect(client.createActivity).toHaveBeenCalledWith({
      caseId: 900001,
      activityType: 'Document sent',
      subject: 'Documents uploaded via ResSpark',
      comment: 'Documents uploaded via ResSpark by Dana Agent: id.pdf rs:aaaa1111',
    })
    expect(recordBatchActivity).toHaveBeenCalledWith(ENV, { batchId: 'b1', state: 'sent', activityId: 9164821 })
  })

  it('records an unknown note outcome as unknown', async () => {
    vi.mocked(finalizeBatch).mockResolvedValue({ batch, sent: [part('id.pdf', B)], unknown: [], all_failed: false })
    client.createActivity.mockResolvedValue({ kind: 'unknown', code: 'logics_5xx' })
    await finalizeBatchIfDone(ENV, 'b1', client)
    expect(recordBatchActivity).toHaveBeenCalledWith(ENV, { batchId: 'b1', state: 'unknown', error: 'logics_5xx' })
  })
})
