import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, keyHint } from './credential-crypto'

const key = '00'.repeat(32)

const flipByte = (token: string, at: number) => {
  const bytes = Buffer.from(token, 'base64url')
  bytes[at] ^= 0x01
  return bytes.toString('base64url')
}

describe('credential crypto', () => {
  it('encrypts to base64url of iv(12) + ciphertext + tag(16)', async () => {
    const token = await encryptSecret(key, 'sk-123')
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(Buffer.from(token, 'base64url').length).toBe(12 + 6 + 16)
  })

  it('uses a fresh IV per call', async () => {
    expect(await encryptSecret(key, 'sk-123')).not.toBe(await encryptSecret(key, 'sk-123'))
  })

  it('round-trips', async () => {
    await expect(decryptSecret(key, await encryptSecret(key, 'sk-123'))).resolves.toBe('sk-123')
  })

  it('rejects decrypt_failed for a different key', async () => {
    const token = await encryptSecret(key, 'sk-123')
    await expect(decryptSecret('11'.repeat(32), token)).rejects.toThrow('decrypt_failed')
  })

  it('rejects decrypt_failed for a flipped ciphertext byte', async () => {
    const token = await encryptSecret(key, 'sk-123')
    await expect(decryptSecret(key, flipByte(token, 14))).rejects.toThrow('decrypt_failed')
  })

  it('rejects decrypt_failed for truncated or garbage input', async () => {
    await expect(decryptSecret(key, 'AAAA')).rejects.toThrow('decrypt_failed')
    await expect(decryptSecret(key, '')).rejects.toThrow('decrypt_failed')
  })

  it('rejects bad_key unless the key is 64 hex characters', async () => {
    await expect(encryptSecret('short', 'x')).rejects.toThrow('bad_key')
    await expect(encryptSecret('zz'.repeat(32), 'x')).rejects.toThrow('bad_key')
  })

  it('never puts the plaintext in an error message', async () => {
    const token = await encryptSecret(key, 'sk-123')
    const errs = await Promise.all([
      decryptSecret('11'.repeat(32), token).then(() => null, (e: Error) => e),
      encryptSecret('short', 'sk-123').then(() => null, (e: Error) => e),
    ])
    for (const e of errs) expect(e?.message).not.toContain('sk-123')
  })

  it('keyHint shows the last four characters, or a mask when shorter', () => {
    expect(keyHint('abcdef1234')).toBe('1234')
    expect(keyHint('ab')).toBe('••••')
  })
})
