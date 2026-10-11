import { createFileRoute, redirect } from '@tanstack/react-router'

// The bare site URL has no page of its own; staff land on /admin (whose guard handles sign-in).
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin', replace: true })
  },
})
