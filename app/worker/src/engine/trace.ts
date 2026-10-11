// 1:1 port of the calculation-trace helpers in src/determination.py (_INCOME_LINES, _step,
// _check, _trace). Labels, formulas and descriptions are the Python wording, verbatim.
import type { FinancialData } from './financial-data'

export interface TraceStep {
  label: string
  formula: string
  inputs: { label: string; value: number }[]
  inputKeys: string[]
  result: number | string
  format: string
  status?: string
}

export interface TraceSection {
  id: string
  title: string
  description: string
  steps: TraceStep[]
}

type IncomeKey =
  | 'gross_wages_taxpayer' | 'gross_wages_spouse' | 'social_security_income' | 'pension_income'
  | 'other_income' | 'interest_dividends_royalties' | 'distributions_income' | 'net_rental_income'
  | 'net_business_income' | 'child_support_received' | 'alimony_received'

const INCOME_LINES: readonly [string, IncomeKey][] = [
  ['Taxpayer wages', 'gross_wages_taxpayer'],
  ['Spouse wages', 'gross_wages_spouse'],
  ['Social Security', 'social_security_income'],
  ['Pension income', 'pension_income'],
  ['Other income', 'other_income'],
  ['Interest, dividends, and royalties', 'interest_dividends_royalties'],
  ['Distributions', 'distributions_income'],
  ['Net rental income', 'net_rental_income'],
  ['Net business income', 'net_business_income'],
  ['Child support received', 'child_support_received'],
  ['Alimony received', 'alimony_received'],
]

export function step(
  label: string,
  formula: string,
  result: number,
  inputs: readonly [string, number][],
  inputKeys: string[] = [],
  format = 'currency',
  status?: string
): TraceStep {
  const out: TraceStep = {
    label,
    formula,
    inputs: inputs.map(([name, value]) => ({ label: name, value })),
    inputKeys,
    result,
    format,
  }
  if (status) out.status = status
  return out
}

// status.replace("_", " ").title()
const title = (status: string): string =>
  status.replaceAll('_', ' ').split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')

export const check = (label: string, detail: string, status: string): TraceStep => ({
  label,
  formula: detail,
  inputs: [],
  inputKeys: [],
  result: title(status),
  format: 'text',
  status,
})

export function buildTrace(
  fd: FinancialData,
  grossIncome: number,
  expenses: number,
  rawNdi: number,
  displayedNdi: number,
  nre: number,
  expenseSteps: TraceStep[],
  equitySteps: TraceStep[],
  checks: TraceStep[]
): TraceSection[] {
  const incomeSteps = INCOME_LINES.map(([label, key]) =>
    step(label, 'Monthly Form 433-A income line', fd[key], [['Amount', fd[key]]], [key])
  )
  incomeSteps.push(step(
    'Total monthly household income', 'Sum of all monthly income lines', grossIncome,
    [['Income total', grossIncome]], INCOME_LINES.map(([, key]) => key)
  ))
  expenseSteps.push(step(
    'Total allowable monthly expenses', 'Sum of all allowed expense categories', expenses,
    [['Expense total', expenses]]
  ))
  equitySteps.push(step(
    'Net realizable equity', 'Sum of realizable equity across assets', nre, [['Equity total', nre]]
  ))
  let disposableFormula = 'Monthly income - allowable expenses'
  if (displayedNdi !== rawNdi) {
    disposableFormula += '; negative amounts are treated as $0 for path selection'
  }
  return [
    { id: 'income', title: 'Monthly household income', description: 'Form 433-A (OIC), Section 7, Box D.', steps: incomeSteps },
    { id: 'expenses', title: 'Allowable monthly expenses', description: 'Actual costs, IRS standards, and the allowed amount used.', steps: expenseSteps },
    { id: 'disposable', title: 'Net disposable income', description: 'Monthly amount remaining after allowable expenses.', steps: [
      step('Net disposable income', disposableFormula, displayedNdi,
        [['Income', grossIncome], ['Expenses', expenses]], [], 'currency'),
    ] },
    { id: 'equity', title: 'Net realizable equity', description: 'Quick-sale values, loans, reserves, and exemptions.', steps: equitySteps },
    { id: 'decision', title: 'Resolution decision checks', description: 'The deterministic gates evaluated in order.', steps: checks },
  ]
}
