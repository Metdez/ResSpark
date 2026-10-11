import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ClientShell } from '@/features/client-link/client-shell'
import { InvalidLinkPage } from '@/features/client-link/invalid-link-page'
import { getState, PortalError } from '../portal-api'
import { CONNECT_COPY } from './connect-copy'

const T = CONNECT_COPY.return
const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'ResSpark'
const noSession = (e: unknown) => e instanceof PortalError && e.status === 401

// D-08: the bank sends the client back here; this page only waits for the server to say so.
export function ReturnPage() {
  const navigate = useNavigate()
  const state = useQuery({
    queryKey: ['portal', 'state'],
    queryFn: getState,
    retry: false,
    refetchInterval: (q) => (noSession(q.state.error) ? false : 3_000),
  })
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 45_000)
    return () => clearTimeout(t)
  }, [])

  // shortcut: any bank step being with the agent counts; a request with two bank steps may return early.
  const connected = !!state.data?.steps.some(
    (s) => s.kind === 'bank_connect' && (s.status === 'submitted' || s.status === 'approved')
  )
  useEffect(() => {
    if (!connected) return
    toast.success(T.connected)
    void navigate({ to: '/c', replace: true })
  }, [connected, navigate])

  if (noSession(state.error)) return <InvalidLinkPage />

  const back = () => void navigate({ to: '/c' })
  return (
    <ClientShell
      firmName={state.data?.firm_name ?? APP_NAME}
      agentName={state.data?.agent_display_name ?? undefined}
    >
      <div className='grid gap-4' aria-live='polite'>
        <div className='flex items-center gap-3'>
          <Loader2 className='size-6 animate-spin motion-reduce:animate-none' aria-hidden='true' />
          <h2 className='text-xl leading-tight font-semibold'>{T.title}</h2>
        </div>
        <p className='text-base text-muted-foreground'>{T.body}</p>
        {slow && (
          <>
            <p className='text-base font-medium'>{T.slow}</p>
            <p className='text-base text-muted-foreground'>{T.slowBody}</p>
            <Button size='xl' className='w-full' onClick={back}>
              {T.back}
            </Button>
          </>
        )}
      </div>
    </ClientShell>
  )
}
