import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { ResetPassword } from '@/features/auth/reset-password'

export const Route = createFileRoute('/admin/reset-password')({
  component: ResetPassword,
  validateSearch: z.object({ token_hash: z.string().optional() }),
})
