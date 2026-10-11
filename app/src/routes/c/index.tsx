import { createFileRoute } from '@tanstack/react-router'
import { PortalPage } from '@/features/client-portal/portal-page'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : undefined)

// T-06-23: only UUIDs survive; anything else in the query string is dropped.
export const Route = createFileRoute('/c/')({
  validateSearch: (s: Record<string, unknown>): { step?: string; signed?: string } => ({
    step: uuid(s.step),
    signed: uuid(s.signed),
  }),
  component: PortalPage,
})
