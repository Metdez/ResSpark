import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SandboxBanner } from '@/features/layout/sandbox-banner'

export const Route = createFileRoute('/admin')({
  component: () => (
    <>
      <SandboxBanner />
      <Outlet />
    </>
  ),
})
