import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { ESIGN_TEMPLATE_LABELS, IRS_ONLINE_NOTE, isEsignTemplateKey } from '@/lib/esign-templates'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { emailCopy, emailLink, getRequest, markCopied } from '@/features/requests/requests-api'
import type { ReviewItem, SignatureView } from './api'
import { useRefreshConnection } from './connections/use-connections'
import { signatureChip } from './signature-status'

// D-20 staff signature card. The signing link is always the ResSpark client link plus ?step= (D-17);
// the DocuSeal URL never reaches staff.
export function SignatureCard({
  item,
  signature,
  requestId,
}: {
  item: ReviewItem
  signature: SignatureView | undefined
  requestId: string
}) {
  // Same key and fetcher as the request page, so both share one cache entry.
  const detail = useQuery({ queryKey: ['request', requestId], queryFn: () => getRequest(requestId) })
  const email = useMutation({ mutationFn: () => emailLink(requestId, item.id) })
  const refresh = useRefreshConnection(requestId)
  const linkUrl = detail.data?.link?.url ?? null
  const key = signature?.template_key
  const label = isEsignTemplateKey(key) ? ESIGN_TEMPLATE_LABELS[key] : item.label
  const note = isEsignTemplateKey(key) ? IRS_ONLINE_NOTE[key] : undefined
  const c = signature?.connection ?? null
  const notSetUp = signature?.configured === false

  async function copy() {
    if (!linkUrl) return
    try {
      await navigator.clipboard.writeText(`${linkUrl}?step=${item.id}`)
    } catch {
      toast.error("Couldn't copy the link", { description: 'Select the link and copy it yourself.' })
      return
    }
    toast.success('Signing link copied')
    void markCopied(requestId).catch(() => undefined)
  }

  const onRefresh = (id: string) =>
    refresh.mutate(id, {
      onError: (e) => {
        if (!(e instanceof ApiError) || e.status === 401) return
        toast.error(GENERIC_ERROR, { description: <span className='text-sm text-muted-foreground'>{e.code}</span> })
      },
    })

  return (
    <div data-signature-card className='grid gap-2 rounded-md bg-muted/40 p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='font-medium'>{label}</span>
        <StatusBadge {...signatureChip(c?.stage ?? null)} />
        {c?.env === 'test' && <Badge variant='outline'>Test</Badge>}
      </div>
      {notSetUp && <p className='text-sm text-muted-foreground'>E-sign not set up</p>}
      <div className='flex flex-wrap gap-2'>
        <Button type='button' variant='outline' size='sm' disabled={!linkUrl} onClick={() => void copy()}>
          Copy signing link
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={!linkUrl || email.isPending}
          onClick={() => email.mutate()}
        >
          {email.isPending && <Loader2 className='size-4 animate-spin' />}
          Email signing link
        </Button>
        {c && !notSetUp && (
          <Button type='button' variant='outline' size='sm' disabled={refresh.isPending} onClick={() => onRefresh(c.id)}>
            <RefreshCw className='size-4' aria-hidden='true' />
            {refresh.isPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        )}
      </div>
      {!linkUrl && <p className='text-sm text-muted-foreground'>Send the request first.</p>}
      {email.data && (
        <p className={email.data.ok ? 'text-sm text-emerald-700 dark:text-emerald-300' : 'text-sm text-muted-foreground'}>
          {emailCopy(email.data, detail.data?.contact_email ?? null)}
        </p>
      )}
      {note && (
        <Alert>
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
