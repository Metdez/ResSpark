import { toast } from 'sonner'
import { ApiError } from '@/lib/api'

export const GENERIC_ERROR =
  'Something went wrong. Try again, and tell your admin if it keeps happening.'

// UI-SPEC Error conventions for every query/mutation error. A 401 means the Worker rejected the
// token: the caller-supplied onSessionEnded signs out and redirects (it owns the router).
export function handleServerError(error: unknown, onSessionEnded?: () => void) {
  if (error instanceof ApiError && error.status === 401) {
    onSessionEnded?.()
    // fixed id: several queries failing together show one toast
    toast.error('Your session ended. Sign in again to continue.', { id: 'session-ended' })
    return
  }
  if (error instanceof ApiError && error.status === 403) {
    toast.error("You don't have access to this.")
    return
  }
  toast.error(GENERIC_ERROR, {
    description: error instanceof ApiError ? error.code : undefined,
  })
}

// App-wide query/mutation handler: staff toasts only under /admin; client pages (/c/*) word their
// own errors. A query with `meta.errorShown` renders its error in-page, so only a 401 goes on.
export function adminErrorHandler(onApiError: (error: unknown) => void) {
  return (error: unknown, meta?: Record<string, unknown>) => {
    if (!/^\/admin(\/|$)/.test(window.location.pathname)) return
    const expired = error instanceof ApiError && error.status === 401
    if (meta?.errorShown && !expired) return
    onApiError(error)
  }
}
