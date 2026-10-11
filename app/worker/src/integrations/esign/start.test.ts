import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '../../db/connections'
import type { ConnectionRow } from '../../db/connections'
import { ProviderError } from '../provider-error'
import * as ds from './docuseal'
import { startSignature, TemplateInvalidError, type SignStartCtx } from './start'

vi.mock('../../db/connections')
vi.mock('./docuseal')

const fixture = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../test/fixtures/docuseal/${name}`, import.meta.url).href), 'utf8'))
const send = vi.fn()
const ENV = { DOCUSEAL_ENV: 'test', JOBS: { send } } as unknown as Env
const FUTURE = '2099-01-01T00:00:00.000Z'

const ctx = (over: Partial<SignStartCtx['caseRow']> = {}): SignStartCtx => ({
  client: { linkId: 'L1', requestId: 'R1', firmId: 'F1', expiresAt: FUTURE, openedAt: null },
  item: { id: 'I1', request_id: 'R1', position: 1, kind: 'signature', label: 'Sign', required: true, status: 'pending', rejection_note: null, config: { template: 'engagement_letter' } },
  caseRow: { id: 'C1', first_name: 'Morgan', last_name: 'Lee', email: 'm@example.com', logics_case_id: 900002, address_line1: null, city: null, state_code: null, zip5: null, ...over },
  contactEmail: null,
  templateKey: 'engagement_letter',
  templateId: 1001,
})
const row = (over: Partial<ConnectionRow> = {}) =>
  ({ id: 'PRIOR', status: 'pending', provider: 'docuseal', kind: 'signature', data: { submitter_id: 5001, expire_at: FUTURE }, ...over }) as ConnectionRow
const submitter = (status: string) => ({ ...fixture('submitter_pending.json'), status })
const createBody = () => vi.mocked(ds.createSubmission).mock.calls[0][1] as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.latestConnectionForItem).mockResolvedValue(null)
  vi.mocked(db.insertConnection).mockImplementation(async (_e, input) => ({ id: 'NEW', ...input }) as ConnectionRow)
  vi.mocked(ds.getTemplate).mockResolvedValue(fixture('template.json'))
  vi.mocked(ds.createSubmission).mockResolvedValue(fixture('submission_create.json'))
})

describe('startSignature', () => {
  it('inserts the row before the submission and never lets DocuSeal message anyone', async () => {
    const res = await startSignature(ENV, ctx())
    expect(res).toEqual({ connection_id: 'NEW', embed_src: 'https://docuseal.com/s/fixtureSlug1', reused: false })
    const insertOrder = vi.mocked(db.insertConnection).mock.invocationCallOrder[0]
    expect(insertOrder).toBeLessThan(vi.mocked(ds.createSubmission).mock.invocationCallOrder[0])
    expect(vi.mocked(db.insertConnection).mock.calls[0][1]).toMatchObject({ provider: 'docuseal', kind: 'signature' })
    const body = createBody()
    expect(body).toMatchObject({ send_email: false, send_sms: false, expire_at: FUTURE })
    expect(body.submitters[0]).toMatchObject({ send_email: false, external_id: 'I1', role: 'Client' })
    expect(vi.mocked(db.updateConnection).mock.calls[0][2]).toMatchObject({ external_id: '4001', link_ref: 'fixtureSlug1' })
  })

  it('a two-role template is template_invalid and writes no row', async () => {
    const tpl = fixture('template.json')
    vi.mocked(ds.getTemplate).mockResolvedValue({ ...tpl, submitters: [...tpl.submitters, { name: 'Rep', uuid: 'x' }] })
    await expect(startSignature(ENV, ctx())).rejects.toBeInstanceOf(TemplateInvalidError)
    await expect(startSignature(ENV, ctx())).rejects.toThrow('template_invalid')
    expect(db.insertConnection).not.toHaveBeenCalled()
  })

  it('prefills Address when the template has it and the case has a confirmed address', async () => {
    const tpl = fixture('template.json')
    vi.mocked(ds.getTemplate).mockResolvedValue({ ...tpl, fields: [...tpl.fields, { name: 'Address' }] })
    await startSignature(ENV, ctx({ address_line1: '12 Main St', city: 'Austin', state_code: 'TX', zip5: '78701' }))
    expect(createBody().submitters[0].fields).toEqual([
      { name: 'Full name', default_value: 'Morgan Lee', readonly: true },
      { name: 'Case ID', default_value: '900002', readonly: true },
      { name: 'Address', default_value: '12 Main St, Austin, TX 78701', readonly: true },
    ])
  })

  it('a vendor failure marks the new row error and rethrows', async () => {
    const err = new ProviderError('docuseal', 500, 'http_500', true)
    vi.mocked(ds.createSubmission).mockRejectedValue(err)
    await expect(startSignature(ENV, ctx())).rejects.toBe(err)
    expect(db.setConnectionStatus).toHaveBeenCalledWith(ENV, 'NEW', 'error', { code: 'http_500' })
  })

  it('a done row returns signed with no vendor call', async () => {
    vi.mocked(db.latestConnectionForItem).mockResolvedValue(row({ status: 'done' }))
    expect(await startSignature(ENV, ctx())).toEqual({ connection_id: 'PRIOR', signed: true, reused: true })
    expect(ds.getSubmitter).not.toHaveBeenCalled()
    expect(ds.getTemplate).not.toHaveBeenCalled()
  })

  it('an open row with an opened submitter reuses the fresh embed URL', async () => {
    vi.mocked(db.latestConnectionForItem).mockResolvedValue(row())
    vi.mocked(ds.getSubmitter).mockResolvedValue(submitter('opened'))
    expect(await startSignature(ENV, ctx())).toEqual({ connection_id: 'PRIOR', embed_src: 'https://docuseal.com/s/fixtureSlug1', reused: true })
    expect(ds.getSubmitter).toHaveBeenCalledWith(ENV, 5001)
    expect(db.insertConnection).not.toHaveBeenCalled()
  })

  it('a completed submitter enqueues a reconcile and returns signed', async () => {
    vi.mocked(db.latestConnectionForItem).mockResolvedValue(row())
    vi.mocked(ds.getSubmitter).mockResolvedValue(submitter('completed'))
    expect(await startSignature(ENV, ctx())).toMatchObject({ signed: true })
    expect(send).toHaveBeenCalledWith({ type: 'reconcile', ref: 'PRIOR' })
  })

  it('a declined submitter closes the row and creates a new submission', async () => {
    vi.mocked(db.latestConnectionForItem).mockResolvedValue(row())
    vi.mocked(ds.getSubmitter).mockResolvedValue(submitter('declined'))
    expect(await startSignature(ENV, ctx())).toMatchObject({ connection_id: 'NEW', reused: false })
    expect(db.setConnectionStatus).toHaveBeenCalledWith(ENV, 'PRIOR', 'error', { code: 'declined' })
    expect(ds.createSubmission).toHaveBeenCalledTimes(1)
  })

  it('an expired row is closed without reading DocuSeal, then replaced', async () => {
    vi.mocked(db.latestConnectionForItem).mockResolvedValue(row({ data: { submitter_id: 5001, expire_at: '2000-01-01T00:00:00Z' } }))
    expect(await startSignature(ENV, ctx())).toMatchObject({ connection_id: 'NEW' })
    expect(db.setConnectionStatus).toHaveBeenCalledWith(ENV, 'PRIOR', 'error', { code: 'expired' })
    expect(ds.getSubmitter).not.toHaveBeenCalled()
  })
})
