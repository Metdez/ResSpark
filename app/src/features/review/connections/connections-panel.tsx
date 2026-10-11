import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConnectionCard } from './connection-card'
import { useConnections } from './use-connections'

// The query (queryKey ['connections', id], refetchInterval pollInterval) lives in useConnections.
export function ConnectionsPanel({ requestId }: { requestId: string }) {
  const q = useConnections(requestId)

  let body: React.ReactNode
  if (q.data) {
    body = q.data.connections.length ? (
      q.data.connections.map((c) => <ConnectionCard key={c.id} connection={c} requestId={requestId} />)
    ) : (
      <div className='grid min-h-60 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground'>
        No connections yet
      </div>
    )
  } else if (q.isError) {
    body = (
      <Alert variant='destructive'>
        <AlertTitle className='whitespace-normal'>Couldn't load the connections</AlertTitle>
        <AlertDescription>
          {GENERIC_ERROR}
          {q.error instanceof ApiError && <span className='text-sm text-muted-foreground'>{q.error.code}</span>}
          <Button type='button' variant='outline' size='sm' className='mt-2' onClick={() => void q.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  } else {
    body = [0, 1, 2].map((i) => <Skeleton key={i} data-skeleton className='h-10 w-full' />)
  }

  return (
    <section className='grid gap-4' aria-labelledby='connections-heading'>
      <h2 id='connections-heading' className='text-xl leading-tight font-semibold'>
        Connections
      </h2>
      {body}
    </section>
  )
}
