import { queryOptions, useQuery } from '@tanstack/react-query'
import { getItemConnection, type ClientConnectionView } from './connection-api'

const ACTIVE: ReadonlySet<ClientConnectionView['status']> = new Set(['pending', 'connected', 'syncing'])
export const isActive = (s: ClientConnectionView['status'] | undefined) => !!s && ACTIVE.has(s)

// Polls every 5 s while the sheet is open and the provider is still delivering; stops at done/error.
export const itemConnectionQuery = (itemId: string, enabled: boolean) =>
  queryOptions({
    queryKey: ['portal', 'connection', itemId],
    queryFn: () => getItemConnection(itemId),
    enabled,
    retry: false,
    refetchInterval: (q) => (enabled && isActive(q.state.data?.connection?.status) ? 5_000 : false),
  })

export const useItemConnection = (itemId: string, enabled: boolean) =>
  useQuery(itemConnectionQuery(itemId, enabled))
