import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '@/features/dashboard'
import { DASHBOARD_STATUSES } from '@/features/dashboard/api'

// A bad hand-edited value falls back to "no filter" instead of an error page.
const searchSchema = z.object({
  status: z.enum(DASHBOARD_STATUSES).optional().catch(undefined),
  q: z.string().max(64).optional().catch(undefined),
})

export const Route = createFileRoute('/admin/_shell/')({
  validateSearch: searchSchema,
  component: Dashboard,
})
