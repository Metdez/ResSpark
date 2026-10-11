import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { GENERIC_ERROR, handleServerError } from './handle-server-error'

const toastError = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: {
    error: toastError,
  },
}))

beforeEach(() => {
  toastError.mockClear()
})

describe('handleServerError', () => {
  it('ends the session on a 401 and shows the session-ended toast', () => {
    const onSessionEnded = vi.fn()
    handleServerError(new ApiError(401, 'unauthorized', 'unauthorized'), onSessionEnded)

    expect(onSessionEnded).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith(
      'Your session ended. Sign in again to continue.',
      { id: 'session-ended' }
    )
  })

  it('shows the no-access copy on a 403 and keeps the session', () => {
    const onSessionEnded = vi.fn()
    handleServerError(new ApiError(403, 'forbidden', 'forbidden'), onSessionEnded)

    expect(onSessionEnded).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith("You don't have access to this.")
  })

  it('shows the generic staff copy with the error code for other API errors', () => {
    handleServerError(new ApiError(500, 'internal', 'Something went wrong'))

    expect(toastError).toHaveBeenCalledWith(GENERIC_ERROR, { description: 'internal' })
  })

  it('shows the generic copy without a code for non-API errors', () => {
    handleServerError(new Error('network'))

    expect(toastError).toHaveBeenCalledWith(GENERIC_ERROR, { description: undefined })
  })
})
