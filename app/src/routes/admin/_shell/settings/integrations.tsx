import { createFileRoute } from '@tanstack/react-router'
import { EsignTemplatesCard } from '@/features/settings/integrations/esign-templates-card'
import { LogicsSettingsPage } from '@/features/settings/integrations/logics-settings-page'

export const Route = createFileRoute('/admin/_shell/settings/integrations')({
  component: () => (
    <LogicsSettingsPage>
      <EsignTemplatesCard />
    </LogicsSettingsPage>
  ),
})
