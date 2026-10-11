import { createFileRoute } from '@tanstack/react-router'
import { PortalPage } from '@/features/client-portal/portal-page'

export const Route = createFileRoute('/c/')({
  component: PortalPage,
})
