import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pollInterval } from '@/lib/polling'
import { unlessHandled } from '@/features/requests/requests-api'
import { createPush, fetchLedger, resolvePush, type LedgerBatch, type LedgerPush } from './api'

// D-10: polls while the tab is visible (refetchIntervalInBackground stays false).
export function useLedger(requestId: string) {
  return useQuery({
    queryKey: ['logics-ledger', requestId],
    queryFn: () => fetchLedger(requestId),
    refetchInterval: pollInterval,
    placeholderData: keepPreviousData,
    meta: { errorShown: true },
  })
}

// Mutations never retry (TanStack default): a second push or resolve is always a staff decision (T-05-21).
function usePushMutation<V, R>(requestId: string, caseId: string, mutationFn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    // The sheet and dialog show refusals in place; only an expired session goes on to the app handler.
    onError: unlessHandled(qc, (e) => e.status !== 401),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['logics-ledger', requestId] })
      void qc.invalidateQueries({ queryKey: ['events', caseId] })
    },
  })
}

export const useCreatePush = (requestId: string, caseId: string) =>
  usePushMutation(requestId, caseId, (body: { document_ids: string[]; push_again?: string[] }) =>
    createPush(requestId, body)
  )

export const useResolvePush = (requestId: string, caseId: string) =>
  usePushMutation(
    requestId,
    caseId,
    (v: { pushId: string; action: 'mark_sent' | 'resend'; logics_document_id?: number }) =>
      resolvePush(v.pushId, {
        action: v.action,
        ...(v.logics_document_id !== undefined && { logics_document_id: v.logics_document_id }),
      })
  )

// Rows of the newest batch that holds each document; a resend's new row replaces the old one per part.
export function latestPushesByDocument(batches: LedgerBatch[]): Map<string, LedgerPush[]> {
  const out = new Map<string, LedgerPush[]>()
  for (const batch of batches) {
    const parts = new Map<string, Map<number, LedgerPush>>()
    for (const p of batch.pushes) {
      if (out.has(p.document_id)) continue
      const byPart = parts.get(p.document_id) ?? new Map<number, LedgerPush>()
      byPart.set(p.part_index, p)
      parts.set(p.document_id, byPart)
    }
    for (const [doc, byPart] of parts) out.set(doc, [...byPart.values()].sort((a, b) => a.part_index - b.part_index))
  }
  return out
}
