import { describe, expect, it } from 'vitest'
import { hashInviteToken, INVITE_TOKEN_SHAPE, newInviteToken, parseEmail, parseName, parsePassword, parseRole } from './input'

describe('account input rules', () => {
  it('normalizes emails and refuses junk', () => {
    expect(parseEmail('  Dana@Firm.TEST ')).toBe('dana@firm.test')
    for (const v of ['', 'no-at', 'a@b', 'a b@c.d', 42, null]) expect(parseEmail(v)).toBeNull()
    expect(parseEmail(`${'a'.repeat(250)}@b.co`)).toBeNull()
  })

  it('collapses whitespace in names and caps their length', () => {
    expect(parseName('  Dana   Lee ')).toBe('Dana Lee')
    expect(parseName('   ')).toBeNull()
    expect(parseName('x'.repeat(121), 120)).toBeNull()
  })

  it('needs 10+ characters and at most 72 bytes of password', () => {
    expect(parsePassword('123456789')).toBeNull()
    expect(parsePassword('1234567890')).toBe('1234567890')
    expect(parsePassword('é'.repeat(37))).toBeNull()
    expect(parsePassword(undefined)).toBeNull()
  })

  it('accepts only the two roles', () => {
    expect(parseRole('admin')).toBe('admin')
    expect(parseRole('owner')).toBeNull()
  })

  it('mints 43-char base64url tokens and hashes them to 64 hex chars', async () => {
    const token = newInviteToken()
    expect(INVITE_TOKEN_SHAPE.test(token)).toBe(true)
    expect(newInviteToken()).not.toBe(token)
    expect(await hashInviteToken(token)).toMatch(/^[0-9a-f]{64}$/)
  })
})
