import { createFileRoute } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

// Pathless layout for the sidebar shell; Plan 06 adds the `beforeLoad` session guard here
export const Route = createFileRoute('/admin/_shell')({
  component: AuthenticatedLayout,
})
