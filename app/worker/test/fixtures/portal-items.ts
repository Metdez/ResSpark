import { hmacKey, mintLinkToken, uuidToBytes } from '../../src/auth/client-link'
import { createAdminClient } from '../../src/db/client'
import { app } from '../../src/index'
import { cleanupRequest, TEST_FIRM_ID } from './request'

// Phase 6 live fixture: an opened request on the "Morgan Lee" test case with address and/or
// signature items and a live client link. Cases are never deleted (events.case_id has no
// ON DELETE), so the case id is fixed and upserted; cleanup() removes the request and its rows.
export const PORTAL_CASE_ID = '00000000-0000-0000-0000-0000000000e6'

type PortalKind = 'address' | 'signature'

export interface PortalFixture {
  firmId: string
  caseId: string
  requestId: string
  linkId: string
  items: Partial<Record<PortalKind, string>>
  cookie(): Promise<string>
  cleanup(): Promise<void>
}

const must = <T>(res: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (res.error || res.data === null) throw new Error(`${what}: ${res.error?.message ?? 'no data'}`)
  return res.data
}

export async function seedPortalItems(
  env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY' | 'CLIENT_LINK_HMAC_KEY'>,
  opts: { kinds: PortalKind[]; signatureTemplate?: string; logicsCaseId?: number }
): Promise<PortalFixture> {
  const admin = createAdminClient(env)
  must(
    await admin
      .from('firms')
      .upsert({ id: TEST_FIRM_ID, name: 'Test firm (automated)' }, { onConflict: 'id', ignoreDuplicates: true })
      .select('id'),
    'seed firm'
  )
  must(
    await admin
      .from('cases')
      .upsert(
        {
          id: PORTAL_CASE_ID,
          firm_id: TEST_FIRM_ID,
          first_name: 'Morgan',
          last_name: 'Lee',
          email: 'morgan.lee@example.com',
          ...(opts.logicsCaseId !== undefined ? { logics_case_id: opts.logicsCaseId } : {}),
        },
        { onConflict: 'id' }
      )
      .select('id'),
    'seed case'
  )
  const now = new Date().toISOString()
  const request = must(
    await admin
      .from('requests')
      .insert({ firm_id: TEST_FIRM_ID, case_id: PORTAL_CASE_ID, template_name: 'test', status: 'opened', sent_at: now, opened_at: now })
      .select('id')
      .single(),
    'seed request'
  ) as { id: string }
  const rows = opts.kinds.map((kind, i) => ({
    request_id: request.id,
    position: i + 1,
    kind,
    label: kind === 'address' ? 'Confirm your address' : 'Sign your form',
    required: true,
    status: 'pending',
    ...(kind === 'signature' ? { config: { template: opts.signatureTemplate ?? 'engagement_letter' } } : {}),
  }))
  const items = must(await admin.from('request_items').insert(rows).select('id, kind'), 'seed items') as {
    id: string
    kind: PortalKind
  }[]
  const link = must(
    await admin
      .from('client_links')
      .insert({ firm_id: TEST_FIRM_ID, request_id: request.id, expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString() })
      .select('id, version')
      .single(),
    'seed link'
  ) as { id: string; version: number }

  return {
    firmId: TEST_FIRM_ID,
    caseId: PORTAL_CASE_ID,
    requestId: request.id,
    linkId: link.id,
    items: Object.fromEntries(items.map((r) => [r.kind, r.id])),
    // Same exchange uploads.test.ts does: mint a link token, follow GET /c/:token, keep rs_client.
    async cookie() {
      const token = await mintLinkToken(await hmacKey(env.CLIENT_LINK_HMAC_KEY), uuidToBytes(link.id), link.version)
      const res = await app.request(`/c/${token}`, { redirect: 'manual' }, env as Env)
      const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
      if (res.status !== 302 || !cookie.startsWith('rs_client=')) throw new Error(`cookie exchange failed (${res.status})`)
      return cookie
    },
    async cleanup() {
      must(await admin.from('connections').delete().eq('request_id', request.id).select('id'), 'delete connections')
      // documents, then the request (cascades items, link, sessions, consents); events stay.
      await cleanupRequest(admin, { request_id: request.id })
    },
  }
}
