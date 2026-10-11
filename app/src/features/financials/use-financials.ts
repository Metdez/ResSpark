import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { pollInterval } from '@/lib/polling'
import { unlessHandled } from '@/features/requests/requests-api'
import { decide, exportWorksheet, getFinancials, latestEvaluation, refreshProposals, runEvaluation, type DecideAction } from './api'

// Polls so proposals written by the financials_propose job appear without a reload (D-08 cadence).
export function useFinancials(caseId: string) {
  return useQuery({
    queryKey: ['financials', caseId],
    queryFn: () => getFinancials(caseId),
    refetchInterval: pollInterval,
    meta: { errorShown: true },
  })
}

export function useLatestEvaluation(caseId: string) {
  return useQuery({ queryKey: ['evaluation', caseId], queryFn: () => latestEvaluation(caseId) })
}

export type DecideInput = { column: string; action: DecideAction; proposal_id?: string; value?: unknown; note?: string }

export function useDecide(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ column, ...body }: DecideInput) => decide(caseId, column, body),
    // A 409 means the proposal was replaced under us; the settled refetch shows the new list.
    onError: unlessHandled(qc, (e) => {
      if (e.code !== 'proposal_stale') return false
      toast.error('This value changed. The list is refreshed.')
      return true
    }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['financials', caseId] }),
  })
}

export function useRefresh(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { window_months?: 3 | 6; spouse_employer_ids?: string[] }) => refreshProposals(caseId, body),
    onSuccess: () => toast.success('Refreshing proposals'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['financials', caseId] }),
  })
}

// `data` keeps the last response, so an information-needed or standards-unavailable result stays on screen.
export function useRunEvaluation(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => runEvaluation(caseId),
    onSettled: () => qc.invalidateQueries({ queryKey: ['evaluation', caseId] }),
  })
}

export function useExportWorksheet(caseId: string) {
  return useMutation({ mutationFn: (runId: string) => exportWorksheet(caseId, runId) })
}
