import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InvalidLinkPage } from '@/features/client-link/invalid-link-page'
import { connectErrorCopy } from '../connect/connect-copy'
import { recordConsent, reconcileConnection } from '../connect/connection-api'
import { ConsentSheet } from '../connect/consent-sheet'
import { getState, PortalError } from '../portal-api'
import { useHeartbeat } from '../use-heartbeat'
import { DocusealEmbed } from './docuseal-embed'
import { EMBED_PREFIX, startSigning } from './sign-api'
import { SIGN_COPY as T } from './sign-copy'

const KEY = ['portal', 'state']
const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'ResSpark'
const CONSENT = new Set(['consent_required', 'consent_text_stale'])
// D-10: e-sign not set up for this firm or form; the agent sends it another way.
const NOT_CONFIGURED = new Set(['provider_not_configured', 'template_not_mapped', 'template_invalid', 'bad_template'])
const codeOf = (e: unknown) => (e instanceof PortalError ? e.code : '')

// D-13/D-14/D-16: full-bleed signing page. Start → (ESIGN consent once) → embed → reconcile → back.
export function SignPage({ itemId }: { itemId: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const state = useQuery({ queryKey: KEY, queryFn: getState, retry: false })
  const begin = useMutation({
    mutationFn: async (agree: boolean) => {
      if (agree) await recordConsent('esign')
      return startSigning(itemId)
    },
  })
  const { mutate } = begin
  useEffect(() => mutate(false), [mutate])

  const lost = [state.error, begin.error].some((e) => e instanceof PortalError && e.status === 401)
  useHeartbeat({ enabled: !lost, lastStep: 'signature' })
  if (lost) return <InvalidLinkPage />

  const code = codeOf(begin.error)
  const consenting = (begin.isError && CONSENT.has(code)) || (begin.isPending && begin.variables === true)
  const result = begin.data
  const back = () => void navigate({ to: '/c' })
  const complete = async (connectionId: string) => {
    await reconcileConnection(connectionId)
    void qc.invalidateQueries({ queryKey: KEY })
    void navigate({ to: '/c', search: { signed: itemId } })
  }

  const message = (text: string, retry = false) => (
    <div className='grid gap-4 p-4' aria-live='polite'>
      <p className='text-base'>{text}</p>
      {retry ? (
        <Button size='xl' className='w-full' onClick={() => mutate(false)}>
          {T.tryAgain}
        </Button>
      ) : (
        <Button size='xl' variant='outline' className='w-full' asChild>
          <Link to='/c'>{T.back}</Link>
        </Button>
      )}
    </div>
  )

  let body
  if (result?.kind === 'embed' && result.embedSrc.startsWith(EMBED_PREFIX))
    body = <DocusealEmbed src={result.embedSrc} onComplete={() => void complete(result.connectionId)} />
  else if (result?.kind === 'signed' || code === 'item_approved') body = message(T.alreadySigned)
  else if (NOT_CONFIGURED.has(code)) body = message(T.notConfigured)
  else if (begin.isError && !consenting) body = message(T.error, true)
  else
    body = (
      <div className='grid gap-3 p-4' aria-busy='true'>
        <p className='text-base text-muted-foreground'>{T.loading}</p>
        <Skeleton className='h-4 w-3/4' />
        <Skeleton className='h-4 w-full' />
      </div>
    )

  return (
    <div className='min-h-dvh bg-background'>
      <header className='sticky top-0 z-10 flex min-h-11 items-center border-b bg-background px-2'>
        <Link to='/c' className='inline-flex min-h-11 items-center gap-2 px-2 text-base font-medium'>
          <ArrowLeft className='size-5' aria-hidden='true' />
          {T.back}
        </Link>
      </header>
      <main className='mx-auto w-full max-w-3xl'>{body}</main>
      <ConsentSheet
        kind='esign'
        firmName={state.data?.firm_name ?? APP_NAME}
        open={consenting}
        busy={begin.isPending}
        notice={code === 'consent_text_stale' ? connectErrorCopy(code, 'bank') : null}
        onAgree={() => mutate(true)}
        onClose={back}
      />
    </div>
  )
}
