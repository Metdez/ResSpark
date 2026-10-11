import { formatPhoneDoc, normalizePhone } from '../../../../src/lib/contact'
import type { LogicsClient, LogicsFindRow } from './client'
import { toSummary, type LogicsCaseSummary, type MatchedField } from './mapper'

export type LookupType = 'case_id' | 'phone' | 'email'

export interface LookupInput {
  type: LookupType
  value: string
  last_name?: string
}

const CASE_ID = /^\d{1,9}$/
// Cheap Worker-side gate; the full Zod email check lives in src/lib/contact.ts.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const digitsOf = (v: unknown) => (typeof v === 'string' ? v.replace(/\D/g, '') : '')

export function detectLookupType(raw: string): LookupType | null {
  const v = raw.trim()
  if (v === '') return null
  if (v.includes('@')) return 'email'
  const stripped = v.replace(/[()+\-. ]/g, '')
  if (!/^\d+$/.test(stripped)) return null
  if (CASE_ID.test(stripped)) return 'case_id'
  return normalizePhone(stripped) ? 'phone' : null
}

function matchedFieldFor(row: LogicsFindRow, input: LookupInput, phoneDigits: string): MatchedField | null {
  if (input.type === 'email') return 'email'
  if (input.last_name?.trim()) return 'last_name_phone'
  if (digitsOf(row.CellPhone) === phoneDigits) return 'cell'
  if (digitsOf(row.HomePhone) === phoneDigits) return 'home'
  if (digitsOf(row.WorkPhone) === phoneDigits) return 'work'
  return null
}

// First occurrence per CaseID wins; newest case first, ties by CaseID ascending, unknown dates last.
function dedupeAndOrder(list: LogicsCaseSummary[]): LogicsCaseSummary[] {
  const seen = new Set<number>()
  const out = list.filter((s) => {
    if (!Number.isInteger(s.logics_case_id) || seen.has(s.logics_case_id)) return false
    seen.add(s.logics_case_id)
    return true
  })
  return out.sort((a, b) => {
    if (a.created_date !== b.created_date) {
      if (a.created_date === null) return 1
      if (b.created_date === null) return -1
      return a.created_date < b.created_date ? 1 : -1
    }
    return a.logics_case_id - b.logics_case_id
  })
}

export async function lookupCases(client: LogicsClient, input: LookupInput): Promise<LogicsCaseSummary[]> {
  if (input.type === 'case_id') {
    const v = input.value.trim()
    if (!CASE_ID.test(v)) throw new Error('case_id_invalid')
    const row = await client.caseInfo(Number.parseInt(v, 10))
    return row ? [toSummary(row, 'case_id')] : []
  }

  let rows: LogicsFindRow[]
  let phoneDigits = ''
  if (input.type === 'email') {
    const email = input.value.trim().toLowerCase()
    if (!EMAIL.test(email)) throw new Error('email_invalid')
    rows = await client.findByEmail(email)
  } else {
    const phone = normalizePhone(input.value)
    if (!phone) throw new Error('phone_invalid')
    phoneDigits = phone.digits
    if (input.last_name?.trim()) {
      rows = await client.findByLastNameAndPhone(input.last_name.trim(), phone.digits)
    } else {
      rows = await client.findByPhone(phone.digits)
      // shortcut: the accepted `phone` header format is undocumented (D-04); retry in the doc's
      // (###)###-#### sample format only when digits-only finds nothing — remove once Andrew confirms
      if (rows.length === 0) rows = await client.findByPhone(formatPhoneDoc(phone.digits))
    }
  }
  return dedupeAndOrder(rows.map((r) => toSummary(r, matchedFieldFor(r, input, phoneDigits))))
}

export async function fetchCaseSummary(client: LogicsClient, caseId: number): Promise<LogicsCaseSummary | null> {
  const row = await client.caseInfo(caseId)
  return row ? toSummary(row, 'case_id') : null
}
