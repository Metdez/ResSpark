import { createFileRoute } from '@tanstack/react-router'
import { TeamPage } from '@/features/settings/team/team-page'

export const Route = createFileRoute('/admin/_shell/settings/team')({
  component: TeamPage,
})
