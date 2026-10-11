// Logics source (D-09): derived values only. DOB, MaritalStatus and TaxLiability text are read
// transiently here and never stored, logged or put in a ref (Phase 2 C8/M6).
import type { ProposalInput, SourceRef } from '../rpc'
import { centsToNumber, parseMoney } from './cents'
import type { ProposeContext } from './run'

export function maritalFromLogics(value: unknown): boolean | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'married') return true
  if (v === 'single' || v === 'divorced' || v === 'widowed') return false
  return null // Separated, blank or unknown text: no proposal.
}

// Full years on `now` (UTC) for "MM/dd/yyyy" or ISO "yyyy-mm-dd..."; invalid, future or > 120 -> null.
export function ageOn(dob: unknown, now: Date): number | null {
  if (typeof dob !== 'string') return null
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dob.trim())
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob.trim())
  const [y, m, d] = us ? [+us[3], +us[1], +us[2]] : iso ? [+iso[1], +iso[2], +iso[3]] : [0, 0, 0]
  const date = new Date(Date.UTC(y, m - 1, d))
  if (!y || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  const ny = now.getUTCFullYear()
  const beforeBirthday = now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)
  const age = ny - y - (beforeBirthday ? 1 : 0)
  return age >= 0 && age <= 120 ? age : null
}

const ref = (field: string): SourceRef[] => [{ kind: 'logics_field', id: field, label: `Logics ${field}` }]
const proposal = (column: string, value: boolean | number, reliability: 'A' | 'B', method: string, field: string): ProposalInput => ({
  canonical_column: column,
  proposed_value: value,
  source_refs: ref(field),
  method,
  window_start: null,
  window_end: null,
  reliability,
})

export async function proposeLogics(ctx: ProposeContext) {
  const info = await ctx.logicsCaseInfo()
  if (!info) return null
  const out: ProposalInput[] = []
  const married = maritalFromLogics(info.MaritalStatus)
  if (married !== null) out.push(proposal('filing_status_married', married, 'A', 'logics_marital_status', 'MaritalStatus'))
  const age = ageOn(info.DOB, ctx.now)
  if (age !== null) out.push(proposal('age_taxpayer', age, 'A', 'logics_dob_age', 'DOB'))
  const liability = typeof info.TaxLiability === 'string' ? parseMoney(info.TaxLiability) : null
  if (liability !== null) out.push(proposal('total_tax_owed', centsToNumber(liability), 'B', 'logics_tax_liability', 'TaxLiability'))
  return { source: 'logics' as const, proposals: out }
}
