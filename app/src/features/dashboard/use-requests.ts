import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { pollInterval } from '@/lib/polling'
import { fetchRequests, type RequestFilters } from './api'

// D-08: polls while visible (refetchIntervalInBackground stays false). The key carries the filter,
// so a response for one filter never renders under another.
export function useRequests({ status, q }: RequestFilters) {
  return useQuery({
    queryKey: ['requests', status ?? 'all', q ?? ''],
    queryFn: () => fetchRequests({ status, q }),
    refetchInterval: pollInterval,
    placeholderData: keepPreviousData,
    meta: { errorShown: true },
  })
}
