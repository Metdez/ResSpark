import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '../db/client'
import { logicsPushSweep } from './logics-push-sweep'

vi.mock('../db/client', () => ({ createAdminClient: vi.fn() }))

const send = vi.fn()
const env = { JOBS: { send } } as unknown as Env
const rpcReturns = (res: { data: unknown; error: unknown }) => {
  const rpc = vi.fn().mockResolvedValue(res)
  vi.mocked(createAdminClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>)
  return rpc
}

afterEach(() => vi.clearAllMocks())

describe('logicsPushSweep', () => {
  it('re-enqueues one logics_push message per orphaned queued row', async () => {
    const rpc = rpcReturns({ data: { swept: 2, requeue: ['a', 'b'] }, error: null })
    await expect(logicsPushSweep(env)).resolves.toEqual({ swept: 2, requeued: 2 })
    expect(rpc).toHaveBeenCalledWith('logics_push_sweep')
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      { type: 'logics_push', provider: 'logics', ref: 'a' },
      { type: 'logics_push', provider: 'logics', ref: 'b' },
    ])
  })

  it('throws on an rpc error and enqueues nothing', async () => {
    rpcReturns({ data: null, error: { message: 'boom' } })
    await expect(logicsPushSweep(env)).rejects.toThrow('logics_sweep_failed')
    expect(send).not.toHaveBeenCalled()
  })
})
