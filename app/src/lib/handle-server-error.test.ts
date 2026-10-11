import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleServerError } from './handle-server-error'

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
  it('shows the Error message', () => {
    handleServerError(new Error('network'))

    expect(toastError).toHaveBeenCalledWith('network')
  })

  it('falls back to a generic message for non-Error values', () => {
    handleServerError({ status: 500 })

    expect(toastError).toHaveBeenCalledWith('Something went wrong')
  })
})
