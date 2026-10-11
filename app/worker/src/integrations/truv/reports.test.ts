import { afterEach, describe, expect, it } from 'vitest'
import acmeDocs from '../../../test/fixtures/truv/documents_acme.json'
import acmeReport from '../../../test/fixtures/truv/income_report_acme.json'
import { stubVendorFetch } from '../../../test/helpers/vendor-fetch'
import { ProviderError } from '../provider-error'
import { collectEmployerFiles, getIncomeReport, getLinkDocuments, md5Hex, stripFileUrls, truvDownload } from './reports'

const env = { TRUV_CLIENT_ID: 'cid', TRUV_SECRET: 'sec' } as Env
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
let vendor: ReturnType<typeof stubVendorFetch> | undefined
afterEach(() => vendor?.restore())

const rejectCode = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x)
  expect(e).toBeInstanceOf(ProviderError)
  return e as ProviderError
}

describe('getIncomeReport / getLinkDocuments', () => {
  it('reads the income report with the auth headers', async () => {
    vendor = stubVendorFetch([{ host: 'prod.truv.com', path: '/v1/links/link_acme/income/report/', respond: () => json(acmeReport) }])
    const report = await getIncomeReport(env, 'link_acme')
    expect(report.id).toBe('rep_acme')
    expect(vendor.calls[0].headers.get('X-Access-Client-Id')).toBe('cid')
    expect(vendor.calls[0].headers.get('X-Access-Secret')).toBe('sec')
  })
  it('a report without employments is a non-transient bad_response', async () => {
    vendor = stubVendorFetch([{ host: 'prod.truv.com', path: /income\/report/, respond: () => json({ id: 'x' }) }])
    const e = await rejectCode(getIncomeReport(env, 'link_x'))
    expect(e.code).toBe('bad_response')
    expect(e.transient).toBe(false)
  })
  it('documents: 404 is an empty list', async () => {
    vendor = stubVendorFetch([{ host: 'prod.truv.com', path: /documents/, respond: () => json({}, 404) }])
    expect(await getLinkDocuments(env, 'link_x')).toEqual([])
  })
})

describe('collectEmployerFiles', () => {
  const files = collectEmployerFiles(acmeReport, acmeDocs)
  it('orders report, stubs, w2s, then uploaded documents, deduped by url', () => {
    expect(files.map((f) => [f.kind, f.name])).toEqual([
      ['income_report', 'income-report.pdf'],
      ['pay_stub', 'paystub-2026-09-15-1001.pdf'],
      ['pay_stub', 'paystub-2026-08-31.pdf'],
      ['w2', 'w2-2025.pdf'],
      ['form_1099', '1099-NEC_2025.pdf'],
    ])
  })
  it('carries the md5sum of statements and w2s only', () => {
    expect(files[0].md5).toBeNull()
    expect(files[1].md5).toMatch(/^[0-9a-f]{32}$/)
    expect(files[4].md5).toBeNull()
  })
})

describe('stripFileUrls', () => {
  it('drops file, pdf_report, access_token and URL strings; keeps the figures', () => {
    const out = stripFileUrls(acmeReport)
    const text = JSON.stringify(out)
    expect(text).not.toContain('files.truv.test')
    expect(text).not.toContain('access_token')
    expect(text).not.toContain('"file"')
    const emp = (out.employments as Array<Record<string, any>>)[0] // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(emp.company.name).toBe('Acme Inc')
    expect(emp.statements[0]).toMatchObject({ gross_pay: '2000.00', pay_date: '2026-09-15' })
  })
})

describe('md5Hex / truvDownload', () => {
  it('md5 of abc', () => expect(md5Hex(new TextEncoder().encode('abc').buffer as ArrayBuffer)).toBe('900150983cd24fb0d6963f7d28e17f72'))
  it('downloads bytes without auth headers', async () => {
    vendor = stubVendorFetch([{ host: 'files.truv.test', path: '/a.pdf', respond: () => new Response('%PDF-1', { headers: { 'content-type': 'application/pdf' } }) }])
    const { bytes, contentType } = await truvDownload('https://files.truv.test/a.pdf')
    expect(new TextDecoder().decode(bytes)).toBe('%PDF-1')
    expect(contentType).toBe('application/pdf')
    expect(vendor.calls[0].headers.get('X-Access-Secret')).toBeNull()
  })
  it('500 is transient, 403 is not', async () => {
    vendor = stubVendorFetch([
      { host: 'files.truv.test', path: '/500', respond: () => new Response('', { status: 500 }) },
      { host: 'files.truv.test', path: '/403', respond: () => new Response('', { status: 403 }) },
    ])
    const a = await rejectCode(truvDownload('https://files.truv.test/500'))
    expect([a.code, a.transient]).toEqual(['file_download_failed', true])
    const b = await rejectCode(truvDownload('https://files.truv.test/403'))
    expect([b.code, b.transient]).toEqual(['file_download_failed', false])
  })
})
