import { useQuery } from '@tanstack/react-query'
import { api, isObject, isOk } from '@/lib/api'

export interface SessionInfo {
  user_id: string
  firm_id: string
  role: 'staff' | 'admin'
  display_name: string
  email?: string
}

export const isSessionInfo = (v: unknown): v is SessionInfo =>
  isObject(v) &&
  typeof v.user_id === 'string' &&
  typeof v.firm_id === 'string' &&
  (v.role === 'staff' || v.role === 'admin') &&
  typeof v.display_name === 'string' &&
  (v.email === undefined || typeof v.email === 'string')

// The Worker-verified identity (GET /api/admin/session); a 401 here means signed out.
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => api('/api/admin/session', {}, isSessionInfo),
  })
}

// Posts signed_out while the token is still valid, then always signs out locally.
// Never throws: returns the event-post error (or null) so the caller can show a toast.
// Skips the post when the Worker already rejected the token ('expired').
export async function signOutEverywhere(reason?: 'expired'): Promise<unknown> {
  let postError: unknown = null
  if (reason !== 'expired') {
    try {
      await api(
        '/api/admin/session',
        { method: 'POST', body: JSON.stringify({ event: 'signed_out' }) },
        isOk
      )
    } catch (error) {
      postError = error
    }
  }
  try {
    // Lazy: supabase.ts throws at load when the build has no VITE_SUPABASE_* (see api.ts).
    const { supabase } = await import('@/lib/supabase')
    // local scope: ends this browser's session only; supabase-js clears storage even on error
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // no client means no stored session to clear
  }
  return postError
}

// Open-redirect guard: only same-origin /admin paths survive the ?redirect= round trip.
const ADMIN_PATH = /^\/admin(?:[/?#]|$)/

export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && ADMIN_PATH.test(value) && !value.includes('\\')
    ? value
    : '/admin'
}
