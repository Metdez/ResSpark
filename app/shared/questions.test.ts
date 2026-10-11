import { describe, expect, it } from 'vitest'
import { CLIENT_QUESTION_IDS, QUESTIONS, clientQuestionOrder, validateClientAnswer } from './questions'

const STAFF_ONLY = ['state_of_residence', 'county_of_residence', 'total_tax_owed', 'tax_only_balance', 'csed_months_remaining']

describe('client intake questions', () => {
  it('asks the client 23 of the 28 questions, never state, county or transcript facts', () => {
    expect(QUESTIONS).toHaveLength(28)
    expect(CLIENT_QUESTION_IDS).toHaveLength(23)
    for (const id of STAFF_ONLY) expect(CLIENT_QUESTION_IDS).not.toContain(id)
  })

  it('starts with marital status and hides the spouse questions until married', () => {
    const order = clientQuestionOrder({})
    expect(order[0]).toBe('filing_status_married')
    expect(order).not.toContain('filing_joint_offer')
    expect(order).not.toContain('age_spouse')
    expect(order).toHaveLength(20)
  })

  it('married: the joint-offer question follows marital status and the spouse age follows the client age', () => {
    const order = clientQuestionOrder({ filing_status_married: true })
    expect(order.slice(0, 2)).toEqual(['filing_status_married', 'filing_joint_offer'])
    expect(order[order.indexOf('age_taxpayer') + 1]).toBe('age_spouse')
  })

  it('initial questions come first, follow-ups after', () => {
    const order = clientQuestionOrder({})
    expect(order.indexOf('in_open_bankruptcy')).toBeLessThan(order.indexOf('dependents_count'))
    expect(order[order.length - 1]).toBe('installment_agreement_last_5_years')
  })

  it('owning a home skips rents_home; not owning asks it', () => {
    expect(clientQuestionOrder({ owns_home: true })).not.toContain('rents_home')
    expect(clientQuestionOrder({ owns_home: false })).toContain('rents_home')
  })

  it('a non-wage-earner is not asked pay frequency', () => {
    expect(clientQuestionOrder({ is_wage_earner: false })).not.toContain('pay_frequency')
    expect(clientQuestionOrder({ is_wage_earner: true })).toContain('pay_frequency')
  })

  it.each([
    ['household_size', 0, 'bad_value'],
    ['household_size', 2, null],
    ['household_size', 2.5, 'bad_value'],
    ['age_taxpayer', 121, 'bad_value'],
    ['age_taxpayer', 0, null],
    ['pay_frequency', 'yearly', 'bad_value'],
    ['pay_frequency', 'biweekly', null],
    ['state_of_residence', 'CA', 'unknown_question'],
    ['toString', true, 'unknown_question'],
    ['owns_home', 'yes', 'bad_value'],
    ['owns_home', false, null],
  ])('validateClientAnswer(%s, %j) is %s', (id, value, expected) => {
    expect(validateClientAnswer(id, value)).toBe(expected)
  })
})
