import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { QUESTIONS } from '../../../shared/questions'
import { evaluateCase } from './intake-workflow'
import type { StandardsRepository } from './standards'

interface GoldenCall {
  method: string
  args: unknown[]
  value: unknown
}

interface GoldenCase {
  name: string
  row: Record<string, unknown>
  expected: Record<string, unknown>
  standards_calls: GoldenCall[]
}

interface Golden {
  questions: { id: string; prompt: string; type: string }[]
  cases: GoldenCase[]
}

const golden = JSON.parse(
  readFileSync(
    // .href: the Workers and Node URL types clash under tsc.
    fileURLToPath(new URL('../../test/fixtures/engine/golden.json', import.meta.url).href),
    'utf8'
  )
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

describe('question contract', () => {
  it('declares the 28 Python questions in order', () => {
    expect(QUESTIONS.length === 28).toBe(true)
    expect(QUESTIONS.map((q) => q.id)).toEqual(golden.questions.map((q) => q.id))
    expect(QUESTIONS.map(({ id, prompt, type }) => ({ id, prompt, type }))).toEqual(golden.questions)
  })
})
