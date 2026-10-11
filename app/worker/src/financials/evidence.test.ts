import { describe, expect, it } from 'vitest'
import { crossCheckFrom, evidenceKind, findStub, parsePayStubRef, payrollFormula, payStubKeySuffix, windowMonths, type MonthlyRow } from './evidence'

const row = (over: Partial<MonthlyRow>): MonthlyRow => ({ canonical_column: 'gross_wages_taxpayer', treatment: 'informational', month: '2026-07-01', amount_cents: 0, txn_count: 1, ...over })

describe('parsePayStubRef', () => {
  it('reads connection, employer, pay date and an optional check number', () => {
    expect(parsePayStubRef('c1:emp_1:2026-09-15')).toEqual({ connection_id: 'c1', employer_id: 'emp_1', pay_date: '2026-09-15', check_number: null })
    expect(parsePayStubRef('c1:emp_1:2026-09-15:1001')).toEqual({ connection_id: 'c1', employer_id: 'emp_1', pay_date: '2026-09-15', check_number: '1001' })
  })
  it('rejects malformed ids', () => {
    for (const id of ['', 'c1:emp_1', 'c1:emp_1:15/09/2026', 'c1::2026-09-15', 'c1:emp_1:2026-09-15:', 'a:b:2026-09-15:1:2']) expect(parsePayStubRef(id)).toBeNull()
  })
  it('matches the stored stub file name of Phase 4', () => {
    expect(payStubKeySuffix(parsePayStubRef('c1:emp_1:2026-09-18:3003')!)).toBe('-emp_1/paystub-2026-09-18-3003.pdf')
    expect(payStubKeySuffix(parsePayStubRef('c1:emp_2:2026-09-15')!)).toBe('-emp_2/paystub-2026-09-15.pdf')
  })
})

describe('evidenceKind', () => {
  it('picks balances for Plaid cash and bank for other Plaid lines', () => {
    expect(evidenceKind({ source: 'plaid', canonical_column: 'cash_and_bank_balances' })).toBe('balances')
    expect(evidenceKind({ source: 'plaid', canonical_column: 'actual_housing_utilities' })).toBe('bank')
  })
  it('maps every other source', () => {
    expect(evidenceKind({ source: 'truv', canonical_column: 'gross_wages_taxpayer' })).toBe('payroll')
    for (const s of ['intake', 'logics', 'address', 'staff', 'document']) expect(evidenceKind({ source: s, canonical_column: 'x' })).toBe(s)
    expect(evidenceKind({ source: 'other', canonical_column: 'x' })).toBe('none')
  })
})

describe('crossCheckFrom', () => {
  it('a wage column gets the informational salary rows as a labelled monthly cross-check', () => {
    const rows = [row({ amount_cents: 300000 }), row({ month: '2026-08-01', amount_cents: 300001 }), row({ treatment: 'expense', amount_cents: 999 })]
    expect(crossCheckFrom(rows, 'gross_wages_taxpayer', 3)).toEqual({ label: 'Plaid salary deposits (net, cross-check only)', monthly: 2000 })
  })
  it('no salary rows, or a non-wage column, gives no cross-check', () => {
    expect(crossCheckFrom([row({ treatment: 'expense' })], 'gross_wages_taxpayer', 3)).toBeNull()
    expect(crossCheckFrom([row({ canonical_column: 'net_business_income', amount_cents: 100 })], 'net_business_income', 3)).toBeNull()
  })
})

describe('windowMonths', () => {
  it('lists every month the window touches, across a year end', () => {
    expect(windowMonths('2026-07-01', '2026-09-30')).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
    expect(windowMonths('2025-11-01', '2026-04-30')).toHaveLength(6)
  })
})

describe('findStub and payrollFormula', () => {
  const data = {
    employers: [
      {
        employer_id: 'emp_1',
        company_name: 'Acme',
        report: {
          employments: [
            {
              pay_frequency: 'BW',
              company: { name: 'Acme Inc' },
              statements: [
                { pay_date: '2026-09-18', check_number: '3003', gross_pay: '2650.00' },
                { pay_date: '2026-08-21', check_number: '3002', gross_pay: '2650.00' },
                { pay_date: '2026-07-24', check_number: '3001', gross_pay: 'n/a' },
              ],
            },
          ],
        },
      },
    ],
  }
  it('reads employer, gross and frequency from the stored report; an unknown stub reads as missing', () => {
    expect(findStub(data, parsePayStubRef('c1:emp_1:2026-09-18:3003')!)).toMatchObject({ employer: 'Acme Inc', gross_cents: 265000, code: 'BW' })
    expect(findStub(data, parsePayStubRef('c1:emp_1:2026-09-18')!)).toMatchObject({ employer: null, gross_cents: null })
    expect(findStub(data, parsePayStubRef('c1:emp_1:2026-07-24:3001')!)).toMatchObject({ gross_cents: null, code: 'BW' })
  })
  it('sum x periods / (stubs x 12), half up, skipping a stub without a gross', () => {
    const stubs = ['c1:emp_1:2026-09-18:3003', 'c1:emp_1:2026-08-21:3002', 'c1:emp_1:2026-07-24:3001'].map((id) => findStub(data, parsePayStubRef(id)!))
    expect(payrollFormula(stubs)).toEqual([{ employer: 'Acme Inc', sum: 5300, stubs: 2, periods_per_year: 26, monthly: 5741.67 }])
  })
})
