import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { INITIAL_QUESTION_IDS, QUESTIONS, validateAnswer } from '../../../shared/questions'
import { calculateAllowableExpenses, netRealizableEquityLines } from './determination'
import { financialDataFromCaseRow, REQUIRED_FINANCIAL_COLUMNS } from './financial-data'
import { evaluateCase } from './intake-workflow'
import { NEXT_STEP, PATHS } from './outcome'
import { pyFixed, wholeDollars } from './py'
import type { StandardsRepository } from './standards'

interface GoldenCall {
  method: string
  args: unknown[]
  value: unknown
}

interface GoldenCase {
  name: string
  row: Record<string, unknown>
  expected: {
    status: string
    missing_question_ids: string[]
    missing_financial_fields: string[]
    review_flags: string[]
    document_requests: unknown[]
    allowable_breakdown: Record<string, number> | null
    nre_lines: Record<string, number> | null
    determination: unknown
  }
  standards_calls: GoldenCall[]
}

interface Golden {
  questions: { id: string; prompt: string; type: string }[]
  initial_question_ids: string[]
  required_financial_columns: string[]
  paths: Record<string, [string, string]>
  next: string
  validations: { question_id: string; value: unknown; ok: boolean; error: string | null }[]
  cases: GoldenCase[]
}

// .href: the Workers and Node URL types clash under tsc.
const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url).href)

const golden = JSON.parse(
  readFileSync(here('../../test/fixtures/engine/golden.json'), 'utf8')
) as Golden

const caseNamed = (name: string): GoldenCase => {
  const found = golden.cases.find((c) => c.name === name)
  if (!found) throw new Error(`golden.json has no case ${name}`)
  return found
}

// Replays the exact (method, args) sequence Python made; anything else throws.
function replay(calls: readonly GoldenCall[]) {
  const queue = [...calls]
  const next = <T>(method: string, args: unknown[]): T => {
    const call = queue.shift()
    if (!call || call.method !== method || JSON.stringify(call.args) !== JSON.stringify(args)) {
      throw new Error(
        `unexpected standards call ${method}(${JSON.stringify(args)}); expected ${JSON.stringify(call ?? null)}`
      )
    }
    return call.value as T
  }
  const repo: StandardsRepository = {
    nationalAmount: (householdSize) => next('national_amount', [householdSize]),
    healthCareAmount: (age) => next('health_care_amount', [age]),
    transportationArea: (state, county) => next('transportation_area', [state, county]),
    transportationOwnershipAmount: (vehicleCount) =>
      next('transportation_ownership_amount', [vehicleCount]),
    transportationOperatingAmount: (area, vehicleCount) =>
      next('transportation_operating_amount', [area, vehicleCount]),
    housingAmount: (state, county, householdSize) =>
      next('housing_amount', [state, county, householdSize]),
  }
  return { repo, remaining: () => queue.length }
}

const complete = golden.cases.filter((c) => c.expected.status !== 'information_needed')

describe('golden parity with the Python oracle', () => {
  it.each(golden.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const fake = replay(c.standards_calls)
    const { status, missing_question_ids, missing_financial_fields, review_flags, document_requests, determination } =
      c.expected
    expect(evaluateCase(c.row, fake.repo)).toEqual({
      status,
      missing_question_ids,
      missing_financial_fields,
      review_flags,
      document_requests,
      determination,
    })
    expect(fake.remaining()).toBe(0)
  })

  it('throws the Python message when a complete case has no standards repository', () => {
    expect(() => evaluateCase(caseNamed('test_a_complete_row_uses_the_determination').row, null)).toThrow(
      'A database-backed standards repository is required for a complete case.'
    )
  })

  it('a call that is not next in the recorded sequence throws', () => {
    const fake = replay([{ method: 'national_amount', args: [2], value: 1558 }])
    expect(() => fake.repo.nationalAmount(3)).toThrow(/unexpected standards call/)
    expect(() => fake.repo.healthCareAmount(30)).toThrow(/unexpected standards call/)
  })
})

describe('allowable breakdown and NRE lines', () => {
  // The breakdown makes exactly the lookups evaluateCase made (the exporter asserts this).
  it.each(complete.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const fd = financialDataFromCaseRow(c.row)
    const fake = replay(c.standards_calls)
    expect(calculateAllowableExpenses(fd, fake.repo)).toEqual(c.expected.allowable_breakdown)
    expect(fake.remaining()).toBe(0)
    expect(netRealizableEquityLines(fd)).toEqual(c.expected.nre_lines)
  })

  it('information_needed cases carry no breakdown and no NRE lines', () => {
    for (const c of golden.cases.filter((x) => x.expected.status === 'information_needed')) {
      expect([c.name, c.expected.allowable_breakdown, c.expected.nre_lines]).toEqual([c.name, null, null])
    }
  })
})

describe('fixture coverage', () => {
  it('holds at least 60 grid and boundary cases', () => {
    const grid = golden.cases.filter((c) => /^(grid|boundary)_/.test(c.name))
    expect(grid.length).toBeGreaterThanOrEqual(60)
  })

  it('has one information_needed null case per required and question-only column', () => {
    const questionOnly = ['pay_frequency', 'has_real_property', 'has_retirement_accounts',
      'has_life_insurance_cash_value', 'has_investment_accounts']
    for (const column of [...golden.required_financial_columns, ...questionOnly]) {
      const c = caseNamed(`null_${column}`)
      expect(c.expected.status).toBe('information_needed')
      expect([...c.expected.missing_question_ids, ...c.expected.missing_financial_fields]).toContain(column)
    }
  })

  it('a non-wage earner with pay_frequency not_applicable is evaluated', () => {
    expect(caseNamed('pay_frequency_not_applicable').expected.status).not.toBe('information_needed')
  })
})

describe('contract constants', () => {
  it('declares the 28 Python questions in order', () => {
    expect(QUESTIONS.length === 28).toBe(true)
    expect(QUESTIONS.map((q) => q.id)).toEqual(golden.questions.map((q) => q.id))
    expect(QUESTIONS.map(({ id, prompt, type }) => ({ id, prompt, type }))).toEqual(golden.questions)
  })

  it('matches INITIAL_QUESTION_IDS, required columns, paths and the next-step sentence', () => {
    expect(INITIAL_QUESTION_IDS).toEqual(golden.initial_question_ids)
    expect(REQUIRED_FINANCIAL_COLUMNS).toEqual(golden.required_financial_columns)
    expect(Object.fromEntries(Object.entries(PATHS).map(([path, o]) => [path, [o.id, o.label]]))).toEqual(
      golden.paths
    )
    expect(NEXT_STEP).toBe(golden.next)
  })

  it('validateAnswer accepts and rejects exactly what validate_answer does', () => {
    expect(golden.validations.length).toBe(QUESTIONS.length * 5)
    for (const v of golden.validations) {
      let error: string | null = null
      try {
        validateAnswer(v.question_id, v.value)
      } catch (e) {
        error = e instanceof TypeError ? e.message : `not a TypeError: ${String(e)}`
      }
      expect([v.question_id, v.value, error]).toEqual([v.question_id, v.value, v.error])
    }
  })
})

describe('Python formatting helpers', () => {
  // Expected values printed by Python 3.11: format(x, ',.2f'), format(x, ',.0f') and _whole_dollars.
  it('pyFixed matches format(x, ",.Nf"), including exact binary ties to even', () => {
    expect([0.125, 0.375, 0.005, -1234.5, -0, 1234567.891].map((x) => pyFixed(x, 2))).toEqual(
      ['0.12', '0.38', '0.01', '-1,234.50', '-0.00', '1,234,567.89']
    )
    expect([2.5, 3.5, 1234567, 0.5].map((x) => pyFixed(x, 0))).toEqual(['2', '4', '1,234,567', '0'])
  })

  it('wholeDollars matches Decimal(str(x)) quantized ROUND_HALF_UP', () => {
    const out = [2.5, -2.5, 0.49999, 1e-7, -0.3, 50516.5, 0.1 + 0.2].map(wholeDollars)
    expect(out).toEqual([3, -3, 0, 0, 0, 50517, 0])
    expect(Object.is(out[4], 0)).toBe(true)
  })
})

describe('engine purity', () => {
  const dir = here('.')
  const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  const forbidden = [
    /from\s+['"]hono/,
    /from\s+['"]@supabase/,
    /\bfetch\s*\(/,
    /\bDate\b/,
    /Math\s*\.\s*(max|min)\b/,
  ]

  it('scans the engine modules', () => {
    expect(sources.length).toBeGreaterThanOrEqual(6)
  })

  it.each(sources)('%s imports nothing impure', (file) => {
    const text = readFileSync(join(dir, file), 'utf8')
    for (const pattern of forbidden) expect(text).not.toMatch(pattern)
  })
})
