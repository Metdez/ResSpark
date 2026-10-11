import { describe, expect, it } from 'vitest'
import { rpcErrorToken } from './rpc-error'

describe('rpcErrorToken', () => {
  it('finds a token behind a SQLSTATE prefix', () => {
    expect(rpcErrorToken({ message: 'P0001: no_items' })).toBe('no_items')
  })

  it('returns a bare token', () => {
    expect(rpcErrorToken({ message: 'request_not_draft' })).toBe('request_not_draft')
  })

  it('returns null for an unrelated Postgres message', () => {
    expect(rpcErrorToken({ message: 'duplicate key value violates unique constraint' })).toBeNull()
  })

  it('returns null for no error', () => {
    expect(rpcErrorToken(null)).toBeNull()
  })

  it('matches whole words only', () => {
    expect(rpcErrorToken({ message: 'no_items_left' })).toBeNull()
  })
})
