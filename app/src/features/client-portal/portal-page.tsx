import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ClientShell } from '@/features/client-link/client-shell'
import { InvalidLinkPage } from '@/features/client-link/invalid-link-page'
import { getState, PortalError, start, type PortalState } from './portal-api'
import { StepList } from './step-list'

const KEY = ['portal', 'state']
const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'ResSpark'
const INTRO_BODY =
  'It takes a few minutes. You can stop and come back any time from the same link.'

const noSession = (e: unknown) => e instanceof PortalError && e.status === 401

// D-10/D-13: intro + Start until opened, then the step list; no session is the ask-your-agent page.
export function PortalPage() {
  const qc = useQueryClient()
  const state = useQuery({
    queryKey: KEY,
    queryFn: getState,
    retry: false,
    refetchOnWindowFocus: true,
  })
  const begin = useMutation({
    mutationFn: start,
    onSuccess: ({ opened_at }) =>
      qc.setQueryData<PortalState>(KEY, (s) => s && { ...s, opened_at }),
    onError: (e) => {
      if (!noSession(e)) toast.error("Couldn't start. Try again.")
    },
  })

  if (noSession(state.error) || noSession(begin.error))
    return <InvalidLinkPage />

  const data = state.data
  if (!data)
    return (
      <ClientShell firmName={APP_NAME}>
        {state.isError ? (
          <>
            <h2 className='text-xl leading-tight font-semibold'>
              Something went wrong
            </h2>
            <p className='mt-2 text-base text-muted-foreground'>
              Close this page and open your link again.
            </p>
          </>
        ) : (
          <div className='flex flex-col gap-3' aria-busy='true'>
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-4 w-full' />
            <Skeleton className='h-4 w-2/3' />
          </div>
        )}
      </ClientShell>
    )

  const agent = data.agent_display_name
  return (
    <ClientShell firmName={data.firm_name} agentName={agent ?? undefined}>
      {data.opened_at === null ? (
        <>
          <h2 className='text-xl leading-tight font-semibold'>
            {`${agent ? `${agent} at ${data.firm_name}` : data.firm_name} needs a few things from you`}
          </h2>
          <p className='mt-2 text-base text-muted-foreground'>{INTRO_BODY}</p>
          <Button
            size='xl'
            className='mt-6 w-full'
            disabled={begin.isPending}
            onClick={() => begin.mutate()}
          >
            {begin.isPending ? (
              <>
                <Loader2 className='animate-spin' aria-hidden='true' />
                Starting…
              </>
            ) : (
              'Start'
            )}
          </Button>
        </>
      ) : (
        <>
          <h2 className='mb-2 text-xl leading-tight font-semibold'>
            Your steps
          </h2>
          <StepList steps={data.steps} />
        </>
      )}
    </ClientShell>
  )
}
