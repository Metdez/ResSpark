import { describe, expect, it } from 'vitest'
import { openToken, sealToken } from './token-vault'

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)
const env = (key = KEY_A) => ({ TOKEN_ENC_KEY_1: key }) as unknown as Env
const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'

describe('token vault', () => {
  it('round-trips with the same key and connection id', async () => {
    const sealed = await sealToken(env(), C1, 'access-sandbox-x')
    expect(await openToken(env(), C1, sealed)).toBe('access-sandbox-x')
  })
  it('another connection id (AAD) fails with decrypt_failed', async () => {
    const sealed = await sealToken(env(), C1, 'access-sandbox-x')
    await expect(openToken(env(), C2, sealed)).rejects.toThrow('decrypt_failed')
  })
  it('a different key fails', async () => {
    const sealed = await sealToken(env(), C1, 'access-sandbox-x')
    await expect(openToken(env(KEY_B), C1, sealed)).rejects.toThrow('decrypt_failed')
  })
  it('uses a 12-byte iv and key_version 1', async () => {
    const sealed = await sealToken(env(), C1, 'access-sandbox-x')
    expect(Buffer.from(sealed.iv, 'base64url')).toHaveLength(12)
    expect(sealed.key_version).toBe(1)
    expect(sealed.ciphertext).not.toContain('access')
  })
  it('two seals of the same plaintext differ', async () => {
    const [a, b] = await Promise.all([sealToken(env(), C1, 't'), sealToken(env(), C1, 't')])
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })
  it('a missing or malformed key throws bad_key', async () => {
    await expect(sealToken(env('short'), C1, 't')).rejects.toThrow('bad_key')
  })
})
