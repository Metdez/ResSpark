import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ClientShell } from '@/features/client-link/client-shell'
import { InvalidLinkPage } from '@/features/client-link/invalid-link-page'
import type { UploadErrorCode } from '@/features/uploads/copy'
import { getState, PortalError, start, type PortalState } from './portal-api'
import { SIGN_COPY } from './sign/sign-copy'
import { StepList } from './step-list'
import { useHeartbeat } from './use-heartbeat'

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

  const navigate = useNavigate()
  // D-17: `step` (deep link) and `signed` (back from signing) are UUIDs checked by validateSearch.
  const search = useSearch({ from: '/c/' })
  const [viewed, setViewed] = useState<string>()
  const [uploadError, setUploadError] = useState<UploadErrorCode>()
  const lost = noSession(state.error) || noSession(begin.error)
  const opened = Boolean(state.data?.opened_at)
  // a revoke turns the next refetch into a 401, which stops the heartbeat with the page
  useHeartbeat({
    enabled: Boolean(state.data) && !lost,
    lastStep: opened ? (viewed ?? 'list') : 'intro',
    lastError: state.isError
      ? 'state_failed'
      : begin.isError
        ? 'start_failed'
        : uploadError,
  })

  useEffect(() => {
    if (!search.signed) return
    toast.success(SIGN_COPY.signed)
    void navigate({ to: '/c', search: { step: search.step }, replace: true })
  }, [search.signed, search.step, navigate])

  if (lost) return <InvalidLinkPage />

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
          <StepList
            steps={data.steps}
            firmName={data.firm_name}
            onView={(s) => setViewed(s.kind)}
            onCloseStep={() => setViewed(undefined)}
            onUploadError={setUploadError}
            autoOpenId={search.step}
            onAutoOpened={() =>
              void navigate({ to: '/c', search: { signed: search.signed }, replace: true })
            }
          />
        </>
      )}
    </ClientShell>
  )
}
