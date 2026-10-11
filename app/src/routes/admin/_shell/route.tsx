import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

// Pathless layout for the sidebar shell. The guard is UX only: the Worker verifies every
// /api/admin/* call. /admin/sign-in sits outside this layout, so it is never guarded.
export const Route = createFileRoute('/admin/_shell')({
  beforeLoad: async ({ location }) => {
    // Lazy: supabase.ts throws at load without VITE_SUPABASE_*, which would break every route.
    const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      throw redirect({ to: '/admin/sign-in', search: { redirect: location.href } })
    }
  },
  pendingComponent: () => null,
  component: AuthenticatedLayout,
})
