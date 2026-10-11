import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { pollInterval } from '@/lib/polling'
import { ago } from '@/lib/relative-time'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ActorBadge } from './actor-badge'
import { fetchEvents, type EventRow } from './api'
import { actionLabel } from './labels'

const dedupe = (rows: EventRow[]) => {
  const seen = new Set<number>()
  return rows.filter((r) => !seen.has(r.id) && seen.add(r.id))
}

export function Timeline({ caseId }: { caseId: string }) {
  // D-08: only the newest page polls; older pages are fetched on click and kept in state.
  const first = useQuery({
    queryKey: ['events', caseId],
    queryFn: () => fetchEvents(caseId),
    refetchInterval: pollInterval,
    placeholderData: keepPreviousData,
    meta: { errorShown: true },
  })
  const [older, setOlder] = useState<EventRow[]>([])
  // undefined until the first click: the cursor then comes from the live first page.
  const [nextBefore, setNextBefore] = useState<string | null | undefined>(undefined)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderFailed, setOlderFailed] = useState(false)

  const cursor = nextBefore === undefined ? first.data?.next_before : nextBefore

  async function loadOlder() {
    if (!first.data || !cursor) return
    setLoadingOlder(true)
    setOlderFailed(false)
    try {
      const res = await fetchEvents(caseId, cursor)
      // The first click snapshots the live page so rows a later poll pushes off it stay listed.
      const base = nextBefore === undefined ? first.data.events : older
      setOlder([...base, ...res.events])
      setNextBefore(res.next_before)
    } catch {
      setOlderFailed(true)
    } finally {
      setLoadingOlder(false)
    }
  }

  return (
    <Card>
      <CardContent className='grid gap-4'>
        <h2 className='text-xl leading-tight font-semibold'>Timeline</h2>
        {first.isPending ? (
          <div className='grid gap-3'>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} data-timeline-skeleton className='h-8 w-full' />
            ))}
          </div>
        ) : first.isError ? (
          <Alert variant='destructive'>
            <AlertTitle className='whitespace-normal'>Couldn't load the timeline</AlertTitle>
            <AlertDescription>
              {GENERIC_ERROR}
              <Button type='button' variant='outline' className='mt-2' onClick={() => void first.refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : first.data.events.length === 0 ? (
          <div className='py-6 text-center'>
            <p className='font-semibold'>No activity yet</p>
            <p className='text-sm text-muted-foreground'>
              Actions by you, the client, and connected providers appear here.
            </p>
          </div>
        ) : (
          <>
            <ol className='grid gap-3 border-l pl-4 text-sm'>
              {dedupe([...first.data.events, ...older]).map((e) => (
                <li key={e.id} data-event-row className='flex flex-wrap items-center gap-3'>
                  <ActorBadge actorType={e.actor_type} />
                  <span data-event-label>{actionLabel(e.action, e.payload)}</span>
                  <span className='text-muted-foreground' title={e.created_at}>
                    {ago(e.created_at)}
                  </span>
                </li>
              ))}
            </ol>
            {olderFailed && (
              <p className='text-sm text-destructive' role='alert'>
                Couldn't load older activity. Try again.
              </p>
            )}
            {cursor && (
              <Button
                type='button'
                variant='outline'
                className='h-11 justify-self-start'
                disabled={loadingOlder}
                onClick={() => void loadOlder()}
              >
                Load older
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
