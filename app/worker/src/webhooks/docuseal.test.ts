import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureText } from '../../test/fixtures/connections'
import { signDocuseal } from '../../test/helpers/docuseal-sign'
import { docusealAdapter } from './docuseal'

const SECRET = 'whsec_unit_secret'
const env = { DOCUSEAL_WEBHOOK_SECRET: SECRET } as unknown as Env
const raw = fixtureText('docuseal/webhook_form_completed.json')
const headers = (sig: string) => new Headers({ 'x-docuseal-signature': sig })
const now = () => Math.floor(Date.now() / 1000)
const verify = async (body: string, sig: string) => docusealAdapter.verify(body, headers(sig), env)

describe('docusealAdapter', () => {
  // Pin the clock: signing and the 300 s window check must read the same "now", even under load.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-11T12:00:00.900Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('verifies a body signed over `${ts}.${raw}` and keys it by event, submitter and timestamp', async () => {
    const v = await verify(raw, await signDocuseal(raw, SECRET))
    expect(v?.iat).toBe(now())
    expect(docusealAdapter.eventKey(v!)).toBe('form.completed:5001:2026-10-11T12:00:00Z')
  })

  it('rejects one byte appended after signing', async () => {
    expect(await verify(raw + ' ', await signDocuseal(raw, SECRET))).toBeNull()
  })

  it('rejects a timestamp 301 s old and accepts 299 s old', async () => {
    expect(await verify(raw, await signDocuseal(raw, SECRET, now() - 301))).toBeNull()
    expect(await verify(raw, await signDocuseal(raw, SECRET, now() - 299))).not.toBeNull()
  })

  it('rejects a timestamp 301 s in the future', async () => {
    expect(await verify(raw, await signDocuseal(raw, SECRET, now() + 301))).toBeNull()
  })

  it('rejects malformed headers: no dot, 63 hex characters, non-hex', async () => {
    const sig = await signDocuseal(raw, SECRET)
    const [ts, hex] = sig.split('.')
    expect(await verify(raw, ts + hex)).toBeNull()
    expect(await verify(raw, `${ts}.${hex.slice(1)}`)).toBeNull()
    expect(await verify(raw, `${ts}.${'z' + hex.slice(1)}`)).toBeNull()
  })

  it('rejects a missing header', async () => {
    expect(await docusealAdapter.verify(raw, new Headers(), env)).toBeNull()
  })

  it('rejects a signature made with another secret', async () => {
    expect(await verify(raw, await signDocuseal(raw, 'whsec_other'))).toBeNull()
  })

  it('rejects a verified submission.created event', async () => {
    const body = JSON.stringify({ ...JSON.parse(raw), event_type: 'submission.created' })
    expect(await verify(body, await signDocuseal(body, SECRET))).toBeNull()
  })

  it('rejects a verified form event without data.submission_id', async () => {
    const body = JSON.stringify({ ...JSON.parse(raw), data: { id: 5001 } })
    expect(await verify(body, await signDocuseal(body, SECRET))).toBeNull()
  })

  it('returns null without throwing for a correctly signed body that is not JSON', async () => {
    const body = 'not json {'
    await expect(verify(body, await signDocuseal(body, SECRET))).resolves.toBeNull()
  })

  it('is configured only when DOCUSEAL_WEBHOOK_SECRET is set', async () => {
    expect(docusealAdapter.configured(env)).toBe(true)
    const empty = { DOCUSEAL_WEBHOOK_SECRET: '' } as unknown as Env
    expect(docusealAdapter.configured(empty)).toBe(false)
    expect(await docusealAdapter.verify(raw, headers(await signDocuseal(raw, SECRET)), empty)).toBeNull()
  })
})
