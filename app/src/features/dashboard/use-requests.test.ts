import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollInterval } from '@/lib/polling'
import { fetchRequests } from './api'
import { useRequests } from './use-requests'

vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useQuery: vi.fn(() => ({})),
}))
vi.mock('./api', () => ({ fetchRequests: vi.fn() }))

// useQuery is mocked, so the hook is a plain function call here.
const options = () => vi.mocked(useQuery).mock.lastCall![0]

describe('useRequests', () => {
  afterEach(() => vi.clearAllMocks())

  it('polls with pollInterval and keeps previous rows while a new key loads', () => {
    useRequests({})
    expect(options().refetchInterval).toBe(pollInterval)
    expect(options().placeholderData).toBe(keepPreviousData)
    expect(options().refetchIntervalInBackground).toBeUndefined()
  })

  it('keys the query by status and q', () => {
    useRequests({})
    expect(options().queryKey).toEqual(['requests', 'all', ''])
    useRequests({ status: 'complete', q: 'ann' })
    expect(options().queryKey).toEqual(['requests', 'complete', 'ann'])
  })

  it('fetches with the same filter it is keyed by', () => {
    useRequests({ status: 'sent', q: 'ann' })
    const queryFn = options().queryFn as () => unknown
    queryFn()
    expect(fetchRequests).toHaveBeenCalledWith({ status: 'sent', q: 'ann' })
  })
})
