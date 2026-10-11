// 1:1 port of steps 1-5 of src/determination.py (step 6 is resolution-path.ts). Constants,
// operation order and wording are the Python oracle's; golden.json parity proves they agree.
import type { FinancialData } from './financial-data'
import { pyMax, pyMin, sumInOrder } from './py'
import {
  healthCareStandard,
  housingStandard,
  nationalStandard,
  type StandardsRepository,
  transportationArea,
  transportationOperatingStandard,
  transportationOwnershipStandard,
} from './standards'
import { step, type TraceStep } from './trace'

// STEP 1 — determination.py:24-31, Form 433-A(OIC) Section 7 Box D. Same `a + b + …` chain.
export function calculateGrossMonthlyIncome(fd: FinancialData): number {
  return (
    fd.gross_wages_taxpayer + fd.gross_wages_spouse + fd.social_security_income
    + fd.pension_income + fd.other_income + fd.interest_dividends_royalties
    + fd.distributions_income + fd.net_rental_income + fd.net_business_income
    + fd.child_support_received + fd.alimony_received
  )
}

// Python dict key order of `allowed` (determination.py:63-77); `total` sums in this order.
export const ALLOWABLE_KEYS = [
  'food_clothing_misc',
  'housing_utilities',
  'vehicle_ownership',
  'vehicle_operating',
  'public_transportation',
  'health_insurance_premiums',
  'out_of_pocket_health_care',
  'court_ordered_payments',
  'child_dependent_care',
  'life_insurance_premiums',
  'current_taxes',
  'delinquent_state_local_tax',
  'secured_debts_other',
] as const

type AllowableKey = (typeof ALLOWABLE_KEYS)[number]
export type AllowableExpenses = Record<AllowableKey | 'total', number>

// determination.py:79-104 — trace rows for the capped and actual-only categories.
const CAPPED = [
  ['Housing and utilities', 'actual_housing_utilities', 'Lesser of actual cost and the IRS local standard', 'housing_utilities'],
  ['Vehicle ownership', 'actual_vehicle_loan_lease', 'Lesser of actual payment and the IRS ownership standard', 'vehicle_ownership'],
  ['Vehicle operating', 'actual_vehicle_operating', 'Lesser of actual cost and the IRS operating standard', 'vehicle_operating'],
] as const

const ACTUAL_ONLY = [
  ['Public transportation', 'actual_public_transportation', 'public_transportation'],
  ['Health insurance premiums', 'actual_health_insurance_premiums', 'health_insurance_premiums'],
  ['Court-ordered payments', 'actual_court_ordered_payments', 'court_ordered_payments'],
  ['Child and dependent care', 'actual_child_dependent_care', 'child_dependent_care'],
  ['Life insurance premiums', 'actual_life_insurance_premiums', 'life_insurance_premiums'],
  ['Current taxes', 'actual_current_taxes', 'current_taxes'],
  ['Delinquent state or local tax', 'actual_delinquent_state_local_tax', 'delinquent_state_local_tax'],
  ['Other secured debts', 'actual_secured_debts_other', 'secured_debts_other'],
] as const

// STEP 2 — determination.py:38-115, Box E. Lesser of actual and standard, except
// food/clothing/misc (line 39) and out-of-pocket health care (line 45): always the standard.
// With `trace`, appends the expense steps exactly as Python does.
export function calculateAllowableExpenses(
  fd: FinancialData,
  repo: StandardsRepository,
  trace: TraceStep[] | null = null
): AllowableExpenses {
  // determination.py:42 — age 65 is the health-care standard's age split.
  const persons65OrOlder = (fd.age_taxpayer >= 65 ? 1 : 0) + (fd.age_spouse >= 65 ? 1 : 0)
  const personsUnder65 = fd.household_size - persons65OrOlder
  // determination.py:44-47 — the area is looked up only when vehicle_count is truthy.
  const area = fd.vehicle_count
    ? transportationArea(repo, fd.state_of_residence, fd.county_of_residence)
    : ''
  // determination.py:48-61 — every standard is looked up first, in this order.
  const foodStandard = nationalStandard(repo, fd.household_size)
  const standard = {
    housing_utilities: housingStandard(repo, fd.state_of_residence, fd.county_of_residence, fd.household_size),
    vehicle_ownership: transportationOwnershipStandard(repo, fd.vehicle_count),
    vehicle_operating: transportationOperatingStandard(repo, area, fd.vehicle_count),
  }
  // Line 45: under-65 standard (age 30) and 65+ standard (age 65).
  const healthStandard =
    personsUnder65 * healthCareStandard(repo, 30) + persons65OrOlder * healthCareStandard(repo, 65)

  const allowed: Record<AllowableKey, number> = {
    food_clothing_misc: foodStandard, // line 39, always the standard
    housing_utilities: pyMin(fd.actual_housing_utilities, standard.housing_utilities), // line 40
    vehicle_ownership: pyMin(fd.actual_vehicle_loan_lease, standard.vehicle_ownership), // line 41
    vehicle_operating: pyMin(fd.actual_vehicle_operating, standard.vehicle_operating), // line 42
    public_transportation: fd.vehicle_count === 0 ? fd.actual_public_transportation : 0, // line 43
    health_insurance_premiums: fd.actual_health_insurance_premiums, // line 44, actual
    out_of_pocket_health_care: healthStandard, // line 45, always the standard
    court_ordered_payments: fd.actual_court_ordered_payments, // line 46, actual
    child_dependent_care: fd.actual_child_dependent_care, // line 47, actual
    life_insurance_premiums: fd.actual_life_insurance_premiums, // line 48, actual
    current_taxes: fd.actual_current_taxes, // line 49, actual
    delinquent_state_local_tax: fd.actual_delinquent_state_local_tax, // line 51, actual
    secured_debts_other: fd.actual_secured_debts_other, // actual
  }
  // determination.py:78 — sum() over the 13 keys, start 0, left to right.
  const total = sumInOrder(ALLOWABLE_KEYS.map((key) => allowed[key]))

  if (trace) {
    trace.push(step(
      'Food, clothing, and miscellaneous', 'IRS national standard', allowed.food_clothing_misc,
      [['IRS standard', foodStandard]], ['household_size']
    ))
    for (const [label, key, formula, allowedKey] of CAPPED) {
      trace.push(step(
        label, formula, allowed[allowedKey],
        [['Actual', fd[key]], ['IRS standard', standard[allowedKey]]], [key]
      ))
    }
    for (const [label, key, allowedKey] of ACTUAL_ONLY) {
      trace.push(step(
        label,
        key !== 'actual_public_transportation' ? 'Actual allowed amount' : 'Actual amount when no vehicle is owned',
        allowed[allowedKey], [['Actual', fd[key]]], [key]
      ))
    }
    // determination.py:110-114 — trace.insert(5, …)
    trace.splice(5, 0, step(
      'Out-of-pocket health care', 'IRS health-care standard by household age', healthStandard,
      [['People under 65', personsUnder65], ['People 65 or older', persons65OrOlder]],
      ['household_size', 'age_taxpayer', 'age_spouse'], 'currency'
    ))
  }
  return { ...allowed, total }
}

// STEP 3 — determination.py:121-125, Box F.
export function calculateNetDisposableIncome(
  fd: FinancialData,
  repo: StandardsRepository
): number {
  return calculateGrossMonthlyIncome(fd) - calculateAllowableExpenses(fd, repo).total
}

export const NRE_LINE_KEYS = [
  'cash',
  'investments',
  'retirement',
  'life_insurance',
  'real_property',
  'vehicles',
  'other_assets',
] as const

export type NreLines = Record<(typeof NRE_LINE_KEYS)[number], number>

export const NRE_LINE_LABELS: Readonly<Record<(typeof NRE_LINE_KEYS)[number], string>> = {
  cash: 'Cash and bank, less the $1,000 reserve — 433-A(OIC) line 1',
  investments: 'Investment accounts, net of loans — 433-A(OIC) line 2',
  retirement: 'Retirement accounts × 0.8, less loans — 433-A(OIC) line 3',
  life_insurance: 'Life-insurance cash value, less loans — 433-A(OIC) line 4',
  real_property: 'Real property × 0.8, less loans — 433-A(OIC) line 5',
  vehicles: 'Vehicles × 0.8, less loans and the $3,450 exemption — 433-A(OIC) line 6',
  other_assets: 'Other valuable assets × 0.8, less loans and $11,980 — 433-A(OIC) line 7',
}

// STEP 4 — determination.py:132-175, Form 433-A(OIC) Section 3, one term per line.
// With `trace`, appends the equity steps exactly as Python does.
export function netRealizableEquityLines(fd: FinancialData, trace: TraceStep[] | null = null): NreLines {
  const cash = pyMax(fd.cash_and_bank_balances - 1000, 0) // line 1: $1,000 reserve
  const investments = pyMax(fd.investment_accounts_net, 0) // line 2
  const retirement = pyMax(
    fd.retirement_accounts_market_value * 0.8 - fd.retirement_accounts_loan_balance,
    0
  ) // line 3: ×0.8 minus loan
  const life_insurance = pyMax(
    fd.life_insurance_cash_value - fd.life_insurance_loan_balance,
    0
  ) // line 4
  const real_property = pyMax(
    fd.real_property_market_value * 0.8 - fd.real_property_loan_balance,
    0
  ) // line 5: ×0.8 minus loan
  let vehicles: number
  const vehicleSteps: TraceStep[] = []
  if (fd.vehicle_market_values.length > 0) {
    // :142-155, per-vehicle list (Python list truthiness)
    vehicles = 0
    fd.vehicle_market_values.forEach((marketValue, index) => {
      const loan = index < fd.vehicle_loan_balances.length ? fd.vehicle_loan_balances[index] : 0
      let equity = pyMax(marketValue * 0.8 - loan, 0)
      let exemption = 0
      if (index === 0 || (index === 1 && fd.filing_joint_offer)) {
        exemption = 3450
        equity = pyMax(equity - 3450, 0) // lines 6a and 6c: $3,450 exemption
      }
      vehicles += equity
      vehicleSteps.push(step(
        `Vehicle ${index + 1}`, 'max(80% market value - loan - exemption, $0)', equity,
        [['Market value', marketValue], ['Loan', loan], ['Exemption', exemption]],
        ['vehicle_market_values', 'vehicle_loan_balances', 'filing_joint_offer']
      ))
    })
  } else {
    // :156-166, legacy totals
    const vehiclesRaw = pyMax(fd.vehicle_market_value_total * 0.8 - fd.vehicle_loan_balance_total, 0)
    const exemptVehicles = pyMin(fd.vehicle_count, fd.filing_joint_offer ? 2 : 1)
    vehicles = pyMax(vehiclesRaw - 3450 * exemptVehicles, 0) // $3,450 per exempt vehicle
    vehicleSteps.push(step(
      'Vehicles', 'max(80% total market value - loans - vehicle exemptions, $0)', vehicles,
      [['Market value', fd.vehicle_market_value_total], ['Loans', fd.vehicle_loan_balance_total],
        ['Exemptions', 3450 * exemptVehicles]],
      ['vehicle_market_value_total', 'vehicle_loan_balance_total', 'vehicle_count', 'filing_joint_offer']
    ))
  }
  const other_assets = pyMax(
    fd.other_valuable_assets_value * 0.8 - fd.other_valuable_assets_loan - 11980,
    0
  ) // line 7: ×0.8 minus $11,980 deduction
  if (trace) {
    trace.push(
      step('Cash and bank accounts', 'max(balance - $1,000 reserve, $0)', cash,
        [['Balance', fd.cash_and_bank_balances], ['Reserve', 1000]], ['cash_and_bank_balances']),
      step('Investments', 'max(net account value, $0)', investments,
        [['Net value', fd.investment_accounts_net]], ['investment_accounts_net']),
      step('Retirement accounts', 'max(80% market value - loans, $0)', retirement,
        [['Market value', fd.retirement_accounts_market_value], ['Loans', fd.retirement_accounts_loan_balance]],
        ['retirement_accounts_market_value', 'retirement_accounts_loan_balance']),
      step('Life insurance', 'max(cash value - policy loans, $0)', life_insurance,
        [['Cash value', fd.life_insurance_cash_value], ['Loans', fd.life_insurance_loan_balance]],
        ['life_insurance_cash_value', 'life_insurance_loan_balance']),
      step('Real property', 'max(80% market value - loans, $0)', real_property,
        [['Market value', fd.real_property_market_value], ['Loans', fd.real_property_loan_balance]],
        ['real_property_market_value', 'real_property_loan_balance']),
      ...vehicleSteps,
      step('Other valuable assets', 'max(80% value - loans - $11,980 deduction, $0)', other_assets,
        [['Value', fd.other_valuable_assets_value], ['Loans', fd.other_valuable_assets_loan], ['Deduction', 11980]],
        ['other_valuable_assets_value', 'other_valuable_assets_loan']),
    )
  }
  return { cash, investments, retirement, life_insurance, real_property, vehicles, other_assets }
}

// determination.py:153 — the seven lines added in Python's order.
export function calculateNetRealizableEquity(fd: FinancialData, trace: TraceStep[] | null = null): number {
  const l = netRealizableEquityLines(fd, trace)
  return l.cash + l.investments + l.retirement + l.life_insurance + l.real_property + l.vehicles + l.other_assets
}

// STEP 5 — determination.py:199-207, Section 9 gates.
export function passesComplianceGate(fd: FinancialData): [boolean, string[]] {
  const reasons: string[] = []
  if (!fd.all_returns_filed) reasons.push('Not all required tax returns are filed.')
  if (fd.in_open_bankruptcy) reasons.push('Currently in an open bankruptcy proceeding.')
  return [reasons.length === 0, reasons]
}
