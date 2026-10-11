// Truv source (D-08, D-09, D-13): gross wages and pay-stub deductions from the stored income reports.
// Deduction categories live in truv_deduction_map rows, never in this file.
import { createAdminClient } from '../../db/client'
import type { ProposalInput, Reliability, SourceRef } from '../rpc'
import { centsToNumber, divHalfUp, toCents } from './cents'
import type { ProposeContext } from './run'

const PERIODS = { W: 52, BW: 26, SM: 24, M: 12 } as const
const ANSWERS = { W: 'weekly', BW: 'biweekly', SM: 'semimonthly', M: 'monthly' } as const
type Code = keyof typeof PERIODS
const isCode = (c: unknown): c is Code => typeof c === 'string' && Object.hasOwn(PERIODS, c)

// A (annual), SA (semiannual), C (contract) or missing: no wage proposal (RESEARCH Pitfall 9).
export const periodsPerYear = (code: string | null | undefined) => (isCode(code) ? PERIODS[code] : null)
export const payFrequencyAnswer = (code: string | null | undefined) => (isCode(code) ? ANSWERS[code] : null)

// SQL ILIKE: % any run, _ one character, backslash escapes the next character.
export function likeToRegExp(pattern: string): RegExp {
  let body = ''
  for (let i = 0; i < pattern.length; i++) {
    let ch = pattern[i]
    if (ch === '%') body += '.*'
    else if (ch === '_') body += '.'
    else {
      if (ch === '\\' && i + 1 < pattern.length) ch = pattern[++i]
      body += ch.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')
    }
  }
  return new RegExp(`^${body}$`, 'is')
}

export interface DeductionMapRow {
  truv_category: string
  name_pattern: string
  treatment: 'expense' | 'informational'
  canonical_column: string | null
  reliability: Reliability | null
}
export interface PayrollConnection {
  id: string
  data: Record<string, unknown> | null
}

type Obj = Record<string, unknown>
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x): x is Obj => !!x && typeof x === 'object') : [])
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const weaker = (a: Reliability, b: Reliability): Reliability => (a > b ? a : b)

interface Total {
  cents: number
  reliability: Reliability
  refs: SourceRef[]
}
const add = (totals: Map<string, Total>, column: string, cents: number, reliability: Reliability, refs: SourceRef[]) => {
  const t = totals.get(column)
  if (t) totals.set(column, { cents: t.cents + cents, reliability: weaker(t.reliability, reliability), refs: [...t.refs, ...refs] })
  else totals.set(column, { cents, reliability, refs })
}

// Pure: null = no fetched report anywhere (source skipped); [] = reports exist but nothing to propose.
export function payrollProposals(
  conns: PayrollConnection[],
  map: DeductionMapRow[],
  window: { start: string; end: string },
  spouseEmployerIds: string[]
): ProposalInput[] | null {
  const employers = conns.flatMap((c) => arr(c.data?.employers).filter((e) => !!e.report && typeof e.report === 'object').map((e) => ({ conn: c.id, e })))
  if (employers.length === 0) return null
  const rules = map.map((r) => ({ ...r, re: likeToRegExp(r.name_pattern) })) // already ordered by priority, id
  const wages = new Map<string, Total>()
  const deductions = new Map<string, Total>()
  const taxpayerAnswers = new Set<string>()

  for (const { conn, e } of employers) {
    const employerId = String(e.employer_id ?? '')
    const wageColumn = spouseEmployerIds.includes(employerId) ? 'gross_wages_spouse' : 'gross_wages_taxpayer'
    for (const emp of arr((e.report as Obj).employments)) {
      const periods = periodsPerYear(emp.pay_frequency as string)
      if (!periods) continue
      const stubs = arr(emp.statements).filter((s) => {
        const d = typeof s.pay_date === 'string' ? s.pay_date.slice(0, 10) : ''
        return d >= window.start && d <= window.end
      })
      if (stubs.length === 0) continue
      const company = text((emp.company as Obj | undefined)?.name) ?? text(e.company_name) ?? 'Employer'
      const monthly = (sum: number) => divHalfUp(sum * periods, stubs.length * 12)
      let gross = 0
      const perColumn = new Map<string, Total>()
      const refs: SourceRef[] = []
      try {
        for (const s of stubs) {
          const date = (s.pay_date as string).slice(0, 10)
          const check = text(s.check_number)
          const ref: SourceRef = { kind: 'pay_stub', id: `${conn}:${employerId}:${date}${check ? `:${check}` : ''}`, label: `${company} · ${date}` }
          refs.push(ref)
          gross += toCents(s.gross_pay as string)
          for (const d of arr(s.deductions)) {
            const name = typeof d.name === 'string' ? d.name : ''
            const rule = rules.find((r) => r.truv_category === d.category && r.re.test(name))
            const cents = Math.abs(toCents(d.amount as string))
            if (rule?.treatment === 'expense' && rule.canonical_column && rule.reliability)
              add(perColumn, rule.canonical_column, cents, rule.reliability, [ref])
          }
        }
      } catch {
        continue // a malformed amount skips this employment; never a guessed figure
      }
      add(wages, wageColumn, monthly(gross), 'A', refs)
      for (const [column, t] of perColumn) add(deductions, column, monthly(t.cents), t.reliability, [...new Map(t.refs.map((r) => [r.id, r])).values()])
      if (wageColumn === 'gross_wages_taxpayer') taxpayerAnswers.add(payFrequencyAnswer(emp.pay_frequency as string)!)
    }
  }

  const proposal = (column: string, value: number | boolean | string, method: string, t: Omit<Total, 'cents'>): ProposalInput => ({
    canonical_column: column,
    proposed_value: value,
    source_refs: t.refs,
    method,
    window_start: window.start,
    window_end: window.end,
    reliability: t.reliability,
  })
  const out: ProposalInput[] = []
  for (const [column, t] of wages) out.push(proposal(column, centsToNumber(t.cents), 'mean_gross_pay_x_periods_div_12', t))
  for (const [column, t] of deductions) out.push(proposal(column, centsToNumber(t.cents), 'mean_deduction_x_periods_div_12', t))
  const taxpayer = wages.get('gross_wages_taxpayer')
  if (taxpayer) {
    out.push(proposal('is_wage_earner', true, 'truv_employment_with_stubs', { reliability: 'A', refs: taxpayer.refs }))
    if (taxpayerAnswers.size === 1) out.push(proposal('pay_frequency', [...taxpayerAnswers][0], 'truv_pay_frequency', { reliability: 'A', refs: taxpayer.refs }))
  }
  return out
}

export async function proposePayroll(ctx: ProposeContext) {
  const db = createAdminClient(ctx.env)
  const conns = await db
    .from('connections')
    .select('id, data')
    .eq('firm_id', ctx.firmId)
    .eq('case_id', ctx.caseId)
    .eq('kind', 'payroll')
    .neq('status', 'removed')
  if (conns.error) throw new Error('payroll_lookup_failed')
  if (conns.data.length === 0) return { source: 'truv' as const, proposals: [] }
  const map = await db
    .from('truv_deduction_map')
    .select('truv_category, name_pattern, treatment, canonical_column, reliability')
    .order('priority')
    .order('id')
  if (map.error) throw new Error('deduction_map_failed')
  const proposals = payrollProposals(conns.data as PayrollConnection[], map.data as DeductionMapRow[], ctx.window, ctx.settings.spouse_employer_ids)
  return proposals && { source: 'truv' as const, proposals }
}
