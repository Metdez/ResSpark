import { createFileRoute } from '@tanstack/react-router'
import { SignUp } from '@/features/auth/sign-up'

export const Route = createFileRoute('/admin/sign-up')({
  component: SignUp,
})
