import { describe, expect, it } from 'vitest'
import { fixtureText } from '../../test/fixtures/connections'
import { signTruv } from '../../test/helpers/truv-sign'
import { truvAdapter } from './truv'

const SECRET = 'sandbox-secret'
const env = { TRUV_SECRET: SECRET } as unknown as Env
const raw = fixtureText('truv/order_status_updated.json')
const headers = (sig: string) => new Headers({ 'x-webhook-sign': sig })

describe('truvAdapter', () => {
  it('verifies a body signed v1= under the Access Secret and keys it by webhook_id', async () => {
    const v = await truvAdapter.verify(raw, headers(await signTruv(SECRET, raw)), env)
    expect(v?.payload.order_id).toBe('ord_fixture_1')
    expect(truvAdapter.eventKey(v!)).toBe('wh_fixture_order_1')
  })

  it('rejects a signature made with another secret', async () => {
    expect(await truvAdapter.verify(raw, headers(await signTruv('other', raw)), env)).toBeNull()
  })

  it('rejects a header without the v1= prefix', async () => {
    const sig = (await signTruv(SECRET, raw)).slice(3)
    expect(await truvAdapter.verify(raw, headers(sig), env)).toBeNull()
  })

  it('rejects a verified body that has no webhook_id', async () => {
    const body = JSON.stringify({ event_type: 'order-status-updated' })
    expect(await truvAdapter.verify(body, headers(await signTruv(SECRET, body)), env)).toBeNull()
  })

  it('is sensitive to the exact bytes: a trailing newline signed as such verifies, without it does not', async () => {
    const withNewline = raw.endsWith('\n') ? raw : raw + '\n'
    const sig = await signTruv(SECRET, withNewline)
    expect(await truvAdapter.verify(withNewline, headers(sig), env)).not.toBeNull()
    expect(await truvAdapter.verify(withNewline.slice(0, -1), headers(sig), env)).toBeNull()
  })

  it('is configured only when TRUV_SECRET is set', () => {
    expect(truvAdapter.configured(env)).toBe(true)
    expect(truvAdapter.configured({ TRUV_SECRET: '' } as unknown as Env)).toBe(false)
  })
})
