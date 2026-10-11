import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pollInterval } from '@/lib/polling'
import { unlessHandled } from '@/features/requests/requests-api'
import { fetchConnections, fetchTransactions, refreshConnection } from './api'

// D-08: polls while the tab is visible (refetchIntervalInBackground stays false).
export function useConnections(requestId: string) {
  return useQuery({
    queryKey: ['connections', requestId],
    queryFn: () => fetchConnections(requestId),
    refetchInterval: pollInterval,
    placeholderData: keepPreviousData,
    meta: { errorShown: true },
  })
}

// D-04: Refresh only asks the server to re-read the provider; the badge then follows the list.
export function useRefreshConnection(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (connectionId: string) => refreshConnection(connectionId),
    // The card toasts its own errors; only an expired session goes on to the app handler.
    onError: unlessHandled(qc, (e) => e.status !== 401),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['connections', requestId] })
      void qc.invalidateQueries({ queryKey: ['review', requestId] })
    },
  })
}

export function useTransactions(connectionId: string, months: 3 | 6, enabled: boolean) {
  return useQuery({
    queryKey: ['transactions', connectionId, months],
    queryFn: () => fetchTransactions(connectionId, months),
    enabled,
    meta: { errorShown: true },
  })
}
