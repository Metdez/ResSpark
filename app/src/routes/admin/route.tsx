import { createFileRoute, Outlet } from '@tanstack/react-router'

// Plan 03 mounts the SANDBOX banner here, above both the sign-in page and the shell
export const Route = createFileRoute('/admin')({
  component: Outlet,
})
