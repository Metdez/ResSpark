import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Join } from '@/features/auth/join'

export const Route = createFileRoute('/admin/join')({
  component: Join,
  validateSearch: z.object({ token: z.string().optional() }),
})
