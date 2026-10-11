import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { passwordResetUrl } from '../src/accounts/service'
import { createAdminClient } from '../src/db/client'
import { app } from '../src/index'
import { TEST_FIRM_ID } from './fixtures/connections'

// Live invite → accept → sign-in → password reset → revoke, in the automated test firm only.
// Run with `pnpm -C app run test:live:file worker/test/accounts-live.test.ts`. Auth users it creates are
// deleted afterwards; invites are deleted; events rows stay (append-only).
const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env
const live = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY && SUPABASE_PUBLISHABLE_KEY)

describe.skipIf(!live)('staff accounts (live)', () => {
  // RESEND_API_KEY blanked: nothing is emailed to the fake addresses.
  const env = { ...process.env, RESEND_API_KEY: '' } as unknown as Env
  const admin = live ? createAdminClient(env) : (undefined as unknown as ReturnType<typeof createAdminClient>)
  const anon = () => createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } })
  const tag = randomBytes(5).toString('hex')
  const inviter = { email: `rs-inviter-${tag}@resspark.test`, password: randomBytes(18).toString('base64url'), id: '' }
  const invitee = { email: `rs-invitee-${tag}@resspark.test`, password: randomBytes(18).toString('base64url') }
  const created: string[] = []
  let inviterToken = ''
  let inviteUrl = ''

  const call = (path: string, init: RequestInit = {}, token?: string) =>
    app.request(
      `https://resspark.test${path}`,
      {
        ...init,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      },
      env
    )
  const signIn = async (email: string, password: string) => {
    const { data, error } = await anon().auth.signInWithPassword({ email, password })
    return error ? null : data
  }

  beforeAll(async () => {
    await admin.from('firms').upsert({ id: TEST_FIRM_ID, name: 'Test firm (automated)' }, { onConflict: 'id', ignoreDuplicates: true })
    const { data, error } = await admin.auth.admin.createUser({
      email: inviter.email,
      password: inviter.password,
      email_confirm: true,
      app_metadata: { firm_id: TEST_FIRM_ID, role: 'admin' },
    })
    if (error || !data.user) throw new Error('inviter create failed')
    inviter.id = data.user.id
    created.push(inviter.id)
    const profile = await admin
      .from('staff_profiles')
      .insert({ user_id: inviter.id, firm_id: TEST_FIRM_ID, role: 'admin', display_name: 'Live Inviter' })
    if (profile.error) throw new Error('inviter profile failed')
    inviterToken = (await signIn(inviter.email, inviter.password))!.session.access_token
  })

  afterAll(async () => {
    if (!live) return
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const mine = (data?.users ?? []).filter((u) => u.email?.endsWith(`-${tag}@resspark.test`)).map((u) => u.id)
    for (const id of new Set([...created, ...mine])) await admin.auth.admin.deleteUser(id)
    await admin.from('staff_invites').delete().eq('firm_id', TEST_FIRM_ID).like('email', `%-${tag}@resspark.test`)
  })

  it('lets an admin invite and returns a join link even without email delivery', async () => {
    const res = await call('/api/admin/team/invites', { method: 'POST', body: JSON.stringify({ email: invitee.email, role: 'staff' }) }, inviterToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string; email_status: string }
    expect(body.email_status).toBe('not_configured')
    expect(body.url).toMatch(/^https:\/\/resspark\.test\/admin\/join\?token=[A-Za-z0-9_-]{43}$/)
    inviteUrl = body.url
    const token = new URL(inviteUrl).searchParams.get('token')!
    const stored = (await admin.from('staff_invites').select('token_hash').eq('email', invitee.email)).data!
    expect(stored).toHaveLength(1)
    expect(stored[0].token_hash).not.toContain(token)
  })

  it('describes the invite to the public join page', async () => {
    const res = await call(`/api/auth/invite?token=${new URL(inviteUrl).searchParams.get('token')}`)
    expect(await res.json()).toMatchObject({ email: invitee.email, role: 'staff', firm_name: 'Test firm (automated)' })
  })

  it('accepts the invite, then the new account signs in with firm claims the Worker accepts', async () => {
    const token = new URL(inviteUrl).searchParams.get('token')
    const res = await call('/api/auth/accept-invite', { method: 'POST', body: JSON.stringify({ token, name: 'Sam Live', password: invitee.password }) })
    expect(await res.json()).toEqual({ ok: true, email: invitee.email })
    const session = await signIn(invitee.email, invitee.password)
    expect(session?.user.app_metadata).toMatchObject({ firm_id: TEST_FIRM_ID, role: 'staff' })
    const me = await call('/api/admin/session', {}, session!.session.access_token)
    expect(await me.json()).toMatchObject({ firm_id: TEST_FIRM_ID, role: 'staff', display_name: 'Sam Live' })
  })

  it('refuses the same invite link a second time', async () => {
    const token = new URL(inviteUrl).searchParams.get('token')
    const res = await call('/api/auth/accept-invite', { method: 'POST', body: JSON.stringify({ token, name: 'Again', password: invitee.password }) })
    expect(res.status).toBe(404)
  })

  it('lists the new member on the team page', async () => {
    const body = (await (await call('/api/admin/team', {}, inviterToken)).json()) as { members: { email: string; role: string }[] }
    expect(body.members).toEqual(expect.arrayContaining([expect.objectContaining({ email: invitee.email, role: 'staff' })]))
  })

  it('resets the password through the recovery token hash', async () => {
    const url = await passwordResetUrl(env, invitee.email, 'https://resspark.test')
    const tokenHash = new URL(url!).searchParams.get('token_hash')!
    const client = anon()
    const verified = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    expect(verified.error).toBeNull()
    const next = randomBytes(18).toString('base64url')
    expect((await client.auth.updateUser({ password: next })).error).toBeNull()
    expect(await signIn(invitee.email, invitee.password)).toBeNull()
    expect(await signIn(invitee.email, next)).not.toBeNull()
    // the recovery token works once
    expect((await anon().auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })).error).not.toBeNull()
  })

  // Opt-in (LIVE_SIGNUP=1): each run leaves one firm row behind, pinned by its append-only events.
  it.skipIf(process.env.LIVE_SIGNUP !== '1')('signs up a new firm whose first user is its admin', async () => {
    const email = `rs-signup-${tag}@resspark.test`
    const password = randomBytes(18).toString('base64url')
    const body = { email, password, name: 'Signup Probe', firm_name: `Automated sign-up check ${tag}` }
    const res = await call('/api/auth/sign-up', { method: 'POST', body: JSON.stringify(body) })
    expect(await res.json()).toEqual({ ok: true, email })
    const session = await signIn(email, password)
    const firmId = session!.user.app_metadata.firm_id as string
    expect(firmId).not.toBe(TEST_FIRM_ID)
    const me = await call('/api/admin/session', {}, session!.session.access_token)
    expect(await me.json()).toMatchObject({ firm_id: firmId, role: 'admin', display_name: 'Signup Probe' })
    const again = await call('/api/auth/sign-up', { method: 'POST', body: JSON.stringify(body) })
    expect(again.status).toBe(409)
  })

  it('revokes an open invite so its link stops working', async () => {
    const res = await call('/api/admin/team/invites', { method: 'POST', body: JSON.stringify({ email: `rs-revoked-${tag}@resspark.test`, role: 'admin' }) }, inviterToken)
    const { id, url } = (await res.json()) as { id: string; url: string }
    expect((await call(`/api/admin/team/invites/${id}`, { method: 'DELETE' }, inviterToken)).status).toBe(200)
    expect((await call(`/api/auth/invite?token=${new URL(url).searchParams.get('token')}`)).status).toBe(404)
  })
})
