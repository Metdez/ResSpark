import { queryOptions, useQuery } from '@tanstack/react-query'
import { listItemDocuments } from '@/features/uploads/api'
import type { PortalStep } from '../portal-api'
import { getItemConnection, type ClientConnectionView } from './connection-api'

const ACTIVE: ReadonlySet<ClientConnectionView['status']> = new Set(['pending', 'connected', 'syncing'])
export const isActive = (s: ClientConnectionView['status'] | undefined) => !!s && ACTIVE.has(s)

// A done payroll sheet can still carry a newer employer in progress (a second order).
const employerInProgress = (v: ClientConnectionView | null | undefined) =>
  v?.status === 'done' && v.employers.some((e) => e.status === 'pending' || e.status === 'connected')

// Polls every 5 s while the sheet is open and the provider is still delivering; stops at done/error.
export const itemConnectionQuery = (itemId: string, enabled: boolean) =>
  queryOptions({
    queryKey: ['portal', 'connection', itemId],
    queryFn: () => getItemConnection(itemId),
    enabled,
    retry: false,
    refetchInterval: (q) => {
      const v = q.state.data?.connection
      return enabled && (isActive(v?.status) || employerInProgress(v)) ? 5_000 : false
    },
  })

export const useItemConnection = (itemId: string, enabled: boolean) =>
  useQuery(itemConnectionQuery(itemId, enabled))

// /api/c/state carries no rejection note; the item's document list does (same key as UploadSheet).
export const useRejectionNote = (step: PortalStep, open: boolean): string | null =>
  useQuery({
    queryKey: ['portal', 'item', step.id, 'documents'],
    queryFn: () => listItemDocuments(step.id),
    enabled: open && step.status === 'rejected',
    retry: false,
  }).data?.item.rejection_note ?? null
