import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// D-14 proof against the live project: public sign-up is refused, admin-created staff can sign in.
// Run with `pnpm -C app run test:live` (loads app/.dev.vars).
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY
const email = process.env.DEMO_STAFF_EMAIL
const password = process.env.DEMO_STAFF_PASSWORD
const FIRM = '00000000-0000-0000-0000-000000000001'

describe.skipIf(!url || !key || !email || !password)('public sign-up disabled', () => {
  const client = () => createClient(url!, key!, { auth: { persistSession: false } })

  it('refuses signUp with signup_disabled', async () => {
    const { data, error } = await client().auth.signUp({
      email: `probe-${randomBytes(6).toString('hex')}@resspark.test`,
      password: randomBytes(18).toString('base64url'),
    })
    expect(error).not.toBeNull()
    expect(
      error?.code === 'signup_disabled' || /Signups not allowed/i.test(error?.message ?? '')
    ).toBe(true)
    expect(data.user).toBeNull()
  })

  it('still lets a seeded staff user sign in with app_metadata claims', async () => {
    const supabase = client()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email!,
      password: password!,
    })
    expect(error).toBeNull()
    expect(typeof data.session?.access_token).toBe('string')
    expect(data.session?.access_token.length).toBeGreaterThan(0)
    expect(data.user?.app_metadata.firm_id).toBe(FIRM)
    await supabase.auth.signOut()
  })
})
