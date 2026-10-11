import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ESIGN_TEMPLATE_LABELS, isEsignTemplateKey } from '@/lib/esign-templates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { getRequest, markCopied } from '@/features/requests/requests-api'
import type { ReviewItem, SignatureView } from './api'
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
  const linkUrl = detail.data?.link?.url ?? null
  const key = signature?.template_key
  const label = isEsignTemplateKey(key) ? ESIGN_TEMPLATE_LABELS[key] : item.label
  const c = signature?.connection ?? null

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

  return (
    <div data-signature-card className='grid gap-2 rounded-md bg-muted/40 p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='font-medium'>{label}</span>
        <StatusBadge {...signatureChip(c?.stage ?? null)} />
        {c?.env === 'test' && <Badge variant='outline'>Test</Badge>}
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button type='button' variant='outline' size='sm' disabled={!linkUrl} onClick={() => void copy()}>
          Copy signing link
        </Button>
      </div>
      {!linkUrl && <p className='text-sm text-muted-foreground'>Send the request first.</p>}
    </div>
  )
}
