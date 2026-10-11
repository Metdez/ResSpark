import { createFileRoute } from '@tanstack/react-router'
import { LogicsSettingsPage } from '@/features/settings/integrations/logics-settings-page'

export const Route = createFileRoute('/admin/_shell/settings/integrations')({
  component: LogicsSettingsPage,
})
