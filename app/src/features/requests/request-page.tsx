import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { GENERIC_ERROR } from '@/lib/handle-server-error'
import { pollInterval } from '@/lib/polling'
import { itemStatusBadge, requestStatusBadge } from '@/lib/status'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/status-badge'
import { RequestContactForm } from './request-contact-form'
import { ReviewPanel } from '@/features/review/review-panel'
import { ConnectionsPanel } from '@/features/review/connections/connections-panel'
import { MirrorCard } from '@/features/review/mirror-card'
import { Timeline } from '@/features/timeline/timeline'
import { LogicsPushCard } from '@/features/logics-push/logics-push-card'
import { RequestLinkActions } from './request-link-actions'
import {
  emailCopy,
  formatDate,
  getRequest,
  logicsErrorCopy,
  markCopied,
  sendErrorExtras,
  sendRequest,
  unlessHandled,
  type RequestDetail,
} from './requests-api'

const CASE_CHANGED = {
  title: 'This case changed in Logics',
  body: 'The name or contact on file no longer matches. Look the client up again before sending.',
}
const FORM_CODES = ['contact_invalid', 'contact_flagged']

// Copy the send route's refusals render in place (no toast); everything else goes to the app handler.
function sendErrorCopy(error: unknown) {
  if (!(error instanceof ApiError)) return undefined
  if (error.code === 'case_changed') return CASE_CHANGED
  return logicsErrorCopy(error.code)
}

const Title = ({ children }: { children: React.ReactNode }) => (
  <h1 className='mb-6 text-2xl leading-tight font-semibold'>{children}</h1>
)
const Heading = ({ children }: { children: React.ReactNode }) => (
  <h2 className='mb-4 text-xl leading-tight font-semibold'>{children}</h2>
)

export function RequestPage({ requestId }: { requestId: string }) {
  const qc = useQueryClient()
  const detail = useQuery({
    queryKey: ['request', requestId],
    queryFn: () => getRequest(requestId),
    meta: { errorShown: true },
    // the header badge follows client uploads too, not only staff decisions
    refetchInterval: pollInterval,
  })
  const send = useMutation({
    mutationFn: (v: { email: string; phone: string; keep_flagged: boolean }) =>
      sendRequest(requestId, v),
    onSuccess: (result, v) => {
      if (result.email) {
        const say = result.email.ok ? toast.success : toast.warning
        say(emailCopy(result.email, v.email))
      }
      return qc.invalidateQueries({ queryKey: ['request', requestId] })
    },
    onError: unlessHandled(
      qc,
      (e) => FORM_CODES.includes(e.code) || !!sendErrorCopy(e)
    ),
  })

  if (detail.isPending)
    return (
      <>
        <Title>Request</Title>
        <div className='grid gap-4'>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className='h-10 w-full' />
          ))}
        </div>
      </>
    )

  if (detail.isError)
    return (
      <>
        <Title>Request</Title>
        <Alert variant='destructive'>
          <AlertTitle className='whitespace-normal'>
            Couldn't load this request
          </AlertTitle>
          <AlertDescription>
            {GENERIC_ERROR}
            {detail.error instanceof ApiError && (
              <span className='text-muted-foreground'>{detail.error.code}</span>
            )}
          </AlertDescription>
        </Alert>
      </>
    )

  const d = detail.data
  const name = [d.case.first_name, d.case.last_name].filter(Boolean).join(' ')
  // The stored link wins once it exists (regenerate/revoke refetch it); a revoked link has no URL.
  const link = d.link
    ? d.link.url
      ? { ...d.link, url: d.link.url }
      : null
    : (send.data ?? null)
  const alert = sendErrorCopy(send.error)
  const extras =
    send.error instanceof ApiError && FORM_CODES.includes(send.error.code)
      ? sendErrorExtras(send.error)
      : undefined

  return (
    <>
      <Title>{name ? `Request for ${name}` : 'Request'}</Title>
      <div className='mb-6 flex flex-wrap items-center gap-3'>
        <StatusBadge {...requestStatusBadge(d.status)} />
        <span className='text-sm text-muted-foreground'>
          Template: {d.template_name}
        </span>
        {d.agent_display_name && (
          <span className='text-sm text-muted-foreground'>
            Sent by {d.agent_display_name}
          </span>
        )}
        <Link
          to='/admin/cases/$caseId/433a'
          params={{ caseId: d.case.case_id }}
          className='text-sm font-medium text-primary underline-offset-4 hover:underline'
        >
          433-A worksheet
        </Link>
      </div>

      <div className='grid gap-6'>
        {d.status === 'draft' && !send.data && (
          <Card>
            <CardContent>
              <Heading>Send the link</Heading>
              {alert && (
                <Alert variant='destructive' className='mb-4'>
                  <AlertTitle className='whitespace-normal'>
                    {alert.title}
                  </AlertTitle>
                  <AlertDescription>{alert.body}</AlertDescription>
                </Alert>
              )}
              <RequestContactForm
                caseEmail={d.case.email}
                casePhoneE164={d.case.phone_e164}
                pending={send.isPending}
                serverExtras={extras}
                onEdit={() => send.reset()}
                onSend={(email, phone, keep_flagged) =>
                  send.mutate({ email, phone, keep_flagged })
                }
              />
            </CardContent>
          </Card>
        )}

        {(link || d.status === 'revoked') && (
          <Card>
            <CardContent>
              <Heading>Client link</Heading>
              {link ? (
                <LinkRow
                  requestId={requestId}
                  url={link.url}
                  expiresAt={link.expires_at}
                />
              ) : (
                <p className='text-sm text-muted-foreground'>
                  This link was revoked.
                </p>
              )}
              {d.status !== 'draft' && (
                <RequestLinkActions
                  request={d}
                  onChanged={() => void detail.refetch()}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Once sent, the review panel lists the same items with their files and decisions (Plan 03-03). */}
        {d.status === 'draft' ? (
          <ItemsCard items={d.items} />
        ) : (
          <>
            <MirrorCard requestId={d.id} />
            <ConnectionsPanel requestId={d.id} />
            <ReviewPanel requestId={d.id} caseId={d.case.case_id} />
            <LogicsPushCard requestId={d.id} caseId={d.case.case_id} />
            <Timeline caseId={d.case.case_id} />
          </>
        )}
      </div>
    </>
  )
}

function LinkRow({
  requestId,
  url,
  expiresAt,
}: {
  requestId: string
  url: string
  expiresAt: string
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      toast.error("Couldn't copy the link", {
        description: 'Select the link and copy it yourself.',
      })
      return
    }
    toast.success('Link copied')
    // D-09: markCopied posts /copied (request.link_copied); a failed record must not undo the copy.
    void markCopied(requestId).catch(() => undefined)
  }

  return (
    <>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Input
          readOnly
          value={url}
          aria-label='Client link'
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button type='button' className='h-10' onClick={copy}>
          <Copy className='size-4' />
          Copy link
        </Button>
      </div>
      <p className='mt-2 text-sm text-muted-foreground' title={expiresAt}>
        Expires {formatDate(expiresAt)}
      </p>
    </>
  )
}

function ItemsCard({ items }: { items: RequestDetail['items'] }) {
  const sorted = [...items].sort((a, b) => a.position - b.position)
  return (
    <Card>
      <CardContent>
        <Heading>Items</Heading>
        <ul className='divide-y'>
          {sorted.map((item) => (
            <li
              key={item.id}
              data-item-row
              className='flex items-center justify-between gap-4 py-2'
            >
              <div className='flex flex-wrap items-baseline gap-2'>
                <span data-item-label>{item.label}</span>
                <span className='text-sm text-muted-foreground'>
                  {item.required ? 'Required' : 'Optional'}
                </span>
              </div>
              <StatusBadge {...itemStatusBadge(item.status, 'staff')} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
