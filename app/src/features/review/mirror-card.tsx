import { AlertTriangle } from 'lucide-react'
import { ago, minutesSince } from '@/lib/relative-time'
import { Card, CardContent } from '@/components/ui/card'
import { useReview } from './use-review'

export type MirrorState =
  | { kind: 'not_opened' }
  | { kind: 'no_session' }
  | { kind: 'active'; step: string | null; seenAt: string; lastError: string | null; stuck: boolean }

type MirrorInput = {
  opened_at: string | null
  status: string
  session: { last_step: string | null; last_error: string | null; seen_at: string } | null
}

const STUCK_MINUTES = 10
const DONE = ['complete', 'revoked']

// D-09: "stuck" is a passive hint only; it sends nothing (reminders are Phase 8).
// eslint-disable-next-line react-refresh/only-export-components
export function mirrorState({ opened_at, status, session }: MirrorInput, now = Date.now()): MirrorState {
  if (!session) return opened_at ? { kind: 'no_session' } : { kind: 'not_opened' }
  return {
    kind: 'active',
    step: session.last_step,
    seenAt: session.seen_at,
    lastError: session.last_error,
    stuck: opened_at !== null && minutesSince(session.seen_at, now) > STUCK_MINUTES && !DONE.includes(status),
  }
}

// Phase 2 heartbeat (02-08) error codes; any other code falls back to its words.
const HEARTBEAT_ERROR_COPY: Record<string, string> = {
  state_failed: "Couldn't load the page",
  start_failed: "Couldn't start",
}

// shortcut: `last_step` is the step kind, so two upload items read alike; have the portal send
// `${kind}:${item_id}` when staff need to tell them apart.
const stepWords = (step: string | null) =>
  step === null || step === 'list'
    ? 'the step list'
    : step === 'intro'
      ? 'the welcome screen'
      : step.replace(/_/g, ' ')

export function MirrorCard({ requestId }: { requestId: string }) {
  const review = useReview(requestId)
  if (!review.data) return null
  const { request, client_session } = review.data
  const state = mirrorState({ opened_at: request.opened_at, status: request.status, session: client_session })

  return (
    <Card>
      <CardContent className='grid gap-2'>
        <h2 className='text-xl leading-tight font-semibold'>Client view</h2>
        {state.kind === 'not_opened' && <p>Client hasn't opened the link yet</p>}
        {state.kind === 'no_session' && <p>No activity in this session yet</p>}
        {state.kind === 'active' && (
          <>
            <p data-mirror-step>
              Client is on: {stepWords(state.step)} — last seen{' '}
              <span title={state.seenAt}>{ago(state.seenAt)}</span>
            </p>
            {state.lastError && (
              <p data-mirror-error className='text-sm text-muted-foreground'>
                Last error: {HEARTBEAT_ERROR_COPY[state.lastError] ?? state.lastError.replace(/_/g, ' ')}
              </p>
            )}
            {state.stuck && (
              <p data-mirror-stuck className='flex items-center gap-2 text-sm text-red-700'>
                <AlertTriangle className='size-4' aria-hidden />
                Client may be stuck — last seen {ago(state.seenAt)}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
