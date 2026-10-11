import { describe, expect, it } from 'vitest'
import { bankProvider, plaidConfigured } from './index'
import { plaidProvider } from './plaid/index'
import { PROVIDER_CAPABILITIES } from './provider'

const env = (over: Record<string, unknown> = {}) => ({ BANK_PROVIDER: 'plaid', PLAID_CLIENT_ID: 'i', PLAID_SECRET: 's', ...over }) as unknown as Env

describe('bankProvider', () => {
  it('selects Plaid by BANK_PROVIDER with its capabilities', () => {
    const p = bankProvider(env())
    expect(p).toBe(plaidProvider)
    expect(p.capabilities).toEqual(PROVIDER_CAPABILITIES.plaid)
  })
  it('throws unknown_provider for teller and anything else', () => {
    expect(() => bankProvider(env(), 'teller')).toThrow('unknown_provider')
    expect(() => bankProvider(env({ BANK_PROVIDER: 'x' }))).toThrow('unknown_provider')
  })
  it('plaidConfigured is false when either secret is empty', () => {
    expect(plaidConfigured(env())).toBe(true)
    expect(plaidConfigured(env({ PLAID_CLIENT_ID: '' }))).toBe(false)
    expect(plaidConfigured(env({ PLAID_SECRET: '' }))).toBe(false)
  })
})
