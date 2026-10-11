import { createFileRoute } from '@tanstack/react-router'
import { InvalidLinkPage } from '@/features/client-link/invalid-link-page'

// Reached only by in-SPA navigation or in dev without the Worker; deployed, the Worker answers first.
export const Route = createFileRoute('/c/$token')({
  component: InvalidLinkPage,
})
