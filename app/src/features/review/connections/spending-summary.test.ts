import { describe, expect, it } from 'vitest'
import type { TransactionRow } from './api'
import { groupLabel, humanizeCategory, summarizeSpending } from './spending-summary'

const tx = (over: Partial<TransactionRow>): TransactionRow => ({
  id: 'T',
  date: '2026-09-15',
  name: null,
  merchant_name: null,
  amount: 10,
  iso_currency_code: 'USD',
  category_primary: 'FOOD_AND_DRINK',
  category_detailed: 'FOOD_AND_DRINK_RESTAURANT',
  pending: false,
  ...over,
})

describe('humanizeCategory', () => {
  it('turns a Plaid primary into words', () => {
    expect(humanizeCategory('RENT_AND_UTILITIES')).toBe('Rent and utilities')
    expect(humanizeCategory(null)).toBe('Uncategorized')
  })
})

describe('groupLabel', () => {
  it('names the detailed categories a case manager asks about, else the primary', () => {
    expect(groupLabel({ category_primary: 'RENT_AND_UTILITIES', category_detailed: 'RENT_AND_UTILITIES_RENT' })).toBe('Rent')
    expect(groupLabel({ category_primary: 'LOAN_PAYMENTS', category_detailed: 'LOAN_PAYMENTS_CAR_PAYMENT' })).toBe('Car payment')
    expect(groupLabel({ category_primary: 'RENT_AND_UTILITIES', category_detailed: 'RENT_AND_UTILITIES_WATER' })).toBe('Utilities')
    expect(groupLabel({ category_primary: 'LOAN_PAYMENTS', category_detailed: 'LOAN_PAYMENTS_OTHER_PAYMENT' })).toBe('Loan payments')
    expect(groupLabel({ category_primary: 'MEDICAL', category_detailed: undefined })).toBe('Medical')
  })
})

describe('summarizeSpending', () => {
  it('groups settled outflows, sorts by total, and averages per month', () => {
    const s = summarizeSpending(
      [
        tx({ id: '1', amount: 1200, category_primary: 'RENT_AND_UTILITIES', category_detailed: 'RENT_AND_UTILITIES_RENT' }),
        tx({ id: '2', amount: 1200, category_primary: 'RENT_AND_UTILITIES', category_detailed: 'RENT_AND_UTILITIES_RENT' }),
        tx({ id: '3', amount: 80.5, category_primary: 'RENT_AND_UTILITIES', category_detailed: 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY' }),
        tx({ id: '4', amount: 40.25, category_primary: 'RENT_AND_UTILITIES', category_detailed: 'RENT_AND_UTILITIES_WATER' }),
        tx({ id: '5', amount: 25.1 }),
      ],
      3
    )
    expect(s.months).toBe(3)
    expect(s.currency).toBe('USD')
    expect(s.expenses).toEqual([
      { label: 'Rent', count: 2, total: 2400, monthly: 800 },
      { label: 'Utilities', count: 2, total: 120.75, monthly: 40.25 },
      { label: 'Food and drink', count: 1, total: 25.1, monthly: 8.37 },
    ])
    expect(s.income).toBeNull()
  })

  it('leaves out pending rows and non-income inflows, and totals income deposits separately', () => {
    const s = summarizeSpending(
      [
        tx({ id: '1', amount: 50, pending: true }),
        tx({ id: '2', amount: -3000, category_primary: 'INCOME', category_detailed: 'INCOME_WAGES' }),
        tx({ id: '3', amount: -3000, category_primary: 'INCOME', category_detailed: 'INCOME_WAGES' }),
        tx({ id: '4', amount: -500, category_primary: 'TRANSFER_IN', category_detailed: 'TRANSFER_IN_DEPOSIT' }),
      ],
      6
    )
    expect(s.expenses).toEqual([])
    expect(s.income).toEqual({ label: 'Income deposits', count: 2, total: 6000, monthly: 1000 })
  })

  it('reads null currency and empty input', () => {
    const s = summarizeSpending([tx({ iso_currency_code: null })], 3)
    expect(s.currency).toBeNull()
    expect(summarizeSpending([], 3)).toEqual({ months: 3, currency: null, expenses: [], income: null })
  })
})
