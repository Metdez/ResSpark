import { describe, expect, it } from 'vitest'
import {
  type ClientLinkRow,
  bytesToUuid,
  cookieSecret,
  hmacKey,
  mintLinkToken,
  uuidToBytes,
  verifyLinkToken,
} from './client-link'

const SECRET = 'unit-test-client-link-secret'
const ENV = {
  CLIENT_LINK_HMAC_KEY: SECRET,
  SUPABASE_URL: 'https://unit.supabase.test',
  SUPABASE_SECRET_KEY: 'sb_secret_unit',
}
const ID = '0f8b2c4e-1a2b-4c3d-8e9f-a0b1c2d3e4f5'
const DAY = 86_400_000

const row = (over: Partial<ClientLinkRow> = {}): ClientLinkRow => ({
  id: ID,
  firm_id: '00000000-0000-0000-0000-000000000001',
  request_id: '22222222-3333-4444-8555-666666666666',
  version: 1,
  expires_at: new Date(Date.now() + DAY).toISOString(),
  revoked_at: null,
  opened_at: null,
  ...over,
})
const finder = (r: ClientLinkRow | null) => async () => r
const mint = async (version = 1, id = ID) =>
  mintLinkToken(await hmacKey(SECRET), uuidToBytes(id), version)

describe('client-link token', () => {
  it('mints a 64-char base64url token', async () => {
    const token = await mint()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[A-Za-z0-9_-]{64}$/)
  })

  it('verifies a freshly minted token and returns the row', async () => {
    const r = row()
    expect((await verifyLinkToken(ENV, await mint(), finder(r)))?.id).toBe(r.id)
  })

  it('rejects a token minted for an older or newer version', async () => {
    expect(await verifyLinkToken(ENV, await mint(2), finder(row()))).toBeNull()
  })

  it('rejects a token with one flipped MAC byte', async () => {
    const raw = Buffer.from(await mint(), 'base64url')
    raw[40] ^= 0x01
    expect(await verifyLinkToken(ENV, raw.toString('base64url'), finder(row()))).toBeNull()
  })

  it('rejects 47- and 49-byte payloads without a lookup', async () => {
    const raw = Buffer.from(await mint(), 'base64url')
    let calls = 0
    const find = async () => {
      calls += 1
      return row()
    }
    expect(await verifyLinkToken(ENV, raw.subarray(0, 47).toString('base64url'), find)).toBeNull()
    expect(
      await verifyLinkToken(ENV, Buffer.concat([raw, Buffer.from([0])]).toString('base64url'), find)
    ).toBeNull()
    expect(calls).toBe(0)
  })

  it('rejects an unknown link id', async () => {
    expect(await verifyLinkToken(ENV, await mint(), finder(null))).toBeNull()
  })

  it('rejects a revoked link', async () => {
    const r = row({ revoked_at: new Date().toISOString() })
    expect(await verifyLinkToken(ENV, await mint(), finder(r))).toBeNull()
  })

  it('rejects an expired link', async () => {
    const r = row({ expires_at: new Date(Date.now() - 1000).toISOString() })
    expect(await verifyLinkToken(ENV, await mint(), finder(r))).toBeNull()
  })

  it('returns null instead of throwing when the lookup fails', async () => {
    const find = async () => {
      throw new Error('db down')
    }
    expect(await verifyLinkToken(ENV, await mint(), find)).toBeNull()
  })

  it('round-trips uuid and bytes', () => {
    const bytes = uuidToBytes(ID)
    expect(bytes).toHaveLength(16)
    expect(bytesToUuid(bytes)).toBe(ID)
  })

  it('derives a cookie secret distinct from the link key material', async () => {
    const s = await cookieSecret(SECRET)
    expect(s).toMatch(/^[0-9a-f]{64}$/)
    expect(s).not.toBe(SECRET)
    expect(await cookieSecret(SECRET)).toBe(s)
  })
})
