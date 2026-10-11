import { createFileRoute } from '@tanstack/react-router'
import { NoLinkPage } from '@/features/client-link/no-link-page'

export const Route = createFileRoute('/c/')({
  component: NoLinkPage,
})
