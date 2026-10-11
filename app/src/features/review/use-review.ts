import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { pollInterval } from '@/lib/polling'
import { unlessHandled } from '@/features/requests/requests-api'
import { approve, fetchReview, reject, type DecisionResponse, type ReviewResponse } from './api'

// D-08: polls while the tab is visible (refetchIntervalInBackground stays false).
export function useReview(requestId: string) {
  return useQuery({
    queryKey: ['review', requestId],
    queryFn: () => fetchReview(requestId),
    refetchInterval: pollInterval,
    placeholderData: keepPreviousData,
    meta: { errorShown: true },
  })
}

function useDecision<V>(requestId: string, caseId: string, mutationFn: (v: V) => Promise<DecisionResponse>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (res) => {
      const before = qc.getQueryData<ReviewResponse>(['review', requestId])?.request.status
      if (res.request_status === 'complete' && before !== 'complete') toast.success('Request complete')
    },
    // The panel shows decision errors in place; only an expired session goes on to the app handler.
    onError: unlessHandled(qc, (e) => e.status !== 401),
    // Also after an error: a 409 means the item changed under us, so refetch the truth.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['review', requestId] })
      void qc.invalidateQueries({ queryKey: ['request', requestId] })
      void qc.invalidateQueries({ queryKey: ['requests'] })
      void qc.invalidateQueries({ queryKey: ['events', caseId] })
    },
  })
}

export const useApprove = (requestId: string, caseId: string) =>
  useDecision(requestId, caseId, (itemId: string) => approve(itemId))

export const useReject = (requestId: string, caseId: string) =>
  useDecision(requestId, caseId, (v: { itemId: string; note: string }) => reject(v.itemId, v.note))
