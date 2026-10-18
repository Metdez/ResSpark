import { createHash } from 'node:crypto'
import { safeName } from '../../storage/case-documents'
import { INCOME_REPORT_DISPLAY_NAME, payStubDisplayName, w2DisplayName } from '../../storage/display-names'
import { isTransientStatus, ProviderError } from '../provider-error'
import { truvFetch } from './client'

export type TruvFileKind = 'income_report' | 'pay_stub' | 'w2' | 'form_1099' | 'other'

export interface TruvFile {
  kind: TruvFileKind
  url: string
  name: string
  // what staff and Logics read (documents.original_filename); name stays the storage key
  displayName: string
  md5: string | null
  mime: string
}

export interface TruvLinkDocument {
  id: string
  type: string
  file: string
  filename: string | null
  mimetype: string | null
}

type Obj = Record<string, unknown>
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const objects = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObject) : [])
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
const hasEmployments = (v: unknown): v is Obj => isObject(v) && Array.isArray(v.employments)

export const getIncomeReport = (env: Env, linkId: string) =>
  truvFetch(env, `/links/${encodeURIComponent(linkId)}/income/report/`, {}, hasEmployments)

// The client's own uploads inside Bridge. No documents is a 404 for some links.
export async function getLinkDocuments(env: Env, linkId: string): Promise<TruvLinkDocument[]> {
  let body: unknown
  try {
    body = await truvFetch<unknown>(env, `/links/${encodeURIComponent(linkId)}/documents/`)
  } catch (e) {
    if (e instanceof ProviderError && e.status === 404) return []
    throw e
  }
  const rows = Array.isArray(body) ? body : isObject(body) ? body.results : null
  return objects(rows)
    .filter((d) => str(d.id) && str(d.file))
    .map((d) => ({ id: d.id as string, type: String(d.type ?? ''), file: d.file as string, filename: str(d.filename), mimetype: str(d.mimetype) }))
}

const DOC_KIND: Record<string, TruvFileKind> = { PAYSTUB: 'pay_stub', W2: 'w2', F1099: 'form_1099' }
const DOC_PREFIX: Record<TruvFileKind, string> = {
  pay_stub: 'paystub-upload',
  w2: 'w2-upload',
  form_1099: 'form-1099-upload',
  income_report: 'income-report',
  other: 'document-upload',
}

// Names make a date sort a name sort within an employer (paystub-<pay_date>[-<check>].pdf).
// displayName is the human-readable name (Oct 12 call); name is unchanged so evidence.ts still matches by suffix.
export function collectEmployerFiles(report: Obj, docs: TruvLinkDocument[]): TruvFile[] {
  const files: TruvFile[] = []
  const add = (f: TruvFile) => {
    if (!files.some((x) => x.url === f.url)) files.push(f)
  }
  const pdf = str(report.pdf_report)
  if (pdf) add({ kind: 'income_report', url: pdf, name: 'income-report.pdf', displayName: INCOME_REPORT_DISPLAY_NAME, md5: null, mime: 'application/pdf' })
  for (const emp of objects(report.employments)) {
    for (const s of objects(emp.statements)) {
      const url = str(s.file)
      if (!url) continue
      const check = str(s.check_number) ?? (typeof s.check_number === 'number' ? String(s.check_number) : null)
      const payDate = str(s.pay_date)
      const date = safeName(payDate ?? 'undated')
      add({
        kind: 'pay_stub',
        url,
        name: `paystub-${date}${check ? '-' + safeName(check) : ''}.pdf`,
        displayName: payStubDisplayName(payDate, check),
        md5: str(s.md5sum),
        mime: 'application/pdf',
      })
    }
    for (const w of objects(emp.w2s)) {
      const url = str(w.file)
      if (!url) continue
      const year = String(w.year ?? 'unknown')
      add({ kind: 'w2', url, name: `w2-${safeName(year)}.pdf`, displayName: w2DisplayName(year), md5: str(w.md5sum), mime: 'application/pdf' })
    }
  }
  for (const d of docs) {
    const kind = DOC_KIND[d.type] ?? 'other'
    const name = d.filename ? safeName(d.filename) : `${DOC_PREFIX[kind]}-${safeName(d.id)}.pdf`
    add({ kind, url: d.file, name, displayName: d.filename ?? name, md5: null, mime: d.mimetype ?? 'application/pdf' })
  }
  return files
}

// Pre-signed URL: no auth headers. Never logged (it is a bearer link to a client document).
export async function truvDownload(url: string): Promise<{ bytes: ArrayBuffer; contentType: string | null }> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new ProviderError('truv', null, 'file_download_failed', true)
  }
  if (!res.ok) {
    await res.body?.cancel()
    throw new ProviderError('truv', res.status, 'file_download_failed', isTransientStatus(res.status))
  }
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get('content-type') }
}

// D-06: only Storage paths persist; vendor file URLs (and the report's access_token) are dropped before storing.
export function stripFileUrls(value: Obj): Obj {
  const walk = (v: unknown, key: string | null): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, null))
    if (isObject(v)) {
      const out: Obj = {}
      for (const [k, x] of Object.entries(v)) {
        if (k === 'file' || k === 'pdf_report' || k === 'access_token') continue
        out[k] = walk(x, k)
      }
      return out
    }
    if (typeof v === 'string' && /^https?:\/\//i.test(v) && key !== null) return undefined
    return v
  }
  return walk(value, null) as Obj
}

// Truv's md5sum check (Web Crypto has no MD5; nodejs_compat's node:crypto does).
export const md5Hex = (bytes: ArrayBuffer) => createHash('md5').update(new Uint8Array(bytes)).digest('hex')
