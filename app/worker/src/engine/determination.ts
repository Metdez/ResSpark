// 1:1 port of src/determination.py. Constants, operation order and wording are the
// Python oracle's; golden.json parity (parity.test.ts) proves the two agree exactly.
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

// STEP 1 — determination.py:23-30, Form 433-A(OIC) Section 7 Box D. Same `a + b + …` chain.
export function calculateGrossMonthlyIncome(fd: FinancialData): number {
  return (
    fd.gross_wages_taxpayer + fd.gross_wages_spouse + fd.social_security_income
    + fd.pension_income + fd.other_income + fd.interest_dividends_royalties
    + fd.distributions_income + fd.net_rental_income + fd.net_business_income
    + fd.child_support_received + fd.alimony_received
  )
}

// Python dict key order of `allowed` (determination.py:48-71); `total` sums in this order.
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

export type AllowableExpenses = Record<(typeof ALLOWABLE_KEYS)[number] | 'total', number>

// STEP 2 — determination.py:37-73, Box E. Lesser of actual and standard, except
// food/clothing/misc (line 39) and out-of-pocket health care (line 45): always the standard.
export function calculateAllowableExpenses(
  fd: FinancialData,
  repo: StandardsRepository
): AllowableExpenses {
  // determination.py:41 — age 65 is the health-care standard's age split.
  const persons65OrOlder = (fd.age_taxpayer >= 65 ? 1 : 0) + (fd.age_spouse >= 65 ? 1 : 0)
  const personsUnder65 = fd.household_size - persons65OrOlder
  // determination.py:43-46 — the area is looked up only when vehicle_count is truthy.
  const area = fd.vehicle_count
    ? transportationArea(repo, fd.state_of_residence, fd.county_of_residence)
    : ''
  // The object literal evaluates its standards calls in the Python dict-literal order.
  const allowed = {
    food_clothing_misc: nationalStandard(repo, fd.household_size), // line 39
    housing_utilities: pyMin(
      fd.actual_housing_utilities,
      housingStandard(repo, fd.state_of_residence, fd.county_of_residence, fd.household_size)
    ), // line 40
    vehicle_ownership: pyMin(
      fd.actual_vehicle_loan_lease,
      transportationOwnershipStandard(repo, fd.vehicle_count)
    ), // line 41
    vehicle_operating: pyMin(
      fd.actual_vehicle_operating,
      transportationOperatingStandard(repo, area, fd.vehicle_count)
    ), // line 42
    public_transportation: fd.vehicle_count === 0 ? fd.actual_public_transportation : 0, // line 43
    health_insurance_premiums: fd.actual_health_insurance_premiums, // line 44, actual
    // determination.py:61-64 — line 45: under-65 standard (age 30) and 65+ standard (age 65).
    out_of_pocket_health_care:
      personsUnder65 * healthCareStandard(repo, 30)
      + persons65OrOlder * healthCareStandard(repo, 65),
    court_ordered_payments: fd.actual_court_ordered_payments, // line 46, actual
    child_dependent_care: fd.actual_child_dependent_care, // line 47, actual
    life_insurance_premiums: fd.actual_life_insurance_premiums, // line 48, actual
    current_taxes: fd.actual_current_taxes, // line 49, actual
    delinquent_state_local_tax: fd.actual_delinquent_state_local_tax, // line 51, actual
    secured_debts_other: fd.actual_secured_debts_other, // actual
  }
  // determination.py:72 — sum() over the 13 keys, start 0, left to right.
  const total = sumInOrder(ALLOWABLE_KEYS.map((key) => allowed[key]))
  return { ...allowed, total }
}

// STEP 3 — determination.py:79-83, Box F.
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

// STEP 4 — determination.py:90-113, Form 433-A(OIC) Section 3, one term per line.
export function netRealizableEquityLines(fd: FinancialData): NreLines {
  const cash = pyMax(fd.cash_and_bank_balances - 1000, 0) // :92, line 1: $1,000 reserve
  const investments = pyMax(fd.investment_accounts_net, 0) // :93, line 2
  const retirement = pyMax(
    fd.retirement_accounts_market_value * 0.8 - fd.retirement_accounts_loan_balance,
    0
  ) // :94-95, line 3: ×0.8 minus loan
  const life_insurance = pyMax(
    fd.life_insurance_cash_value - fd.life_insurance_loan_balance,
    0
  ) // :96, line 4
  const real_property = pyMax(
    fd.real_property_market_value * 0.8 - fd.real_property_loan_balance,
    0
  ) // :97-98, line 5: ×0.8 minus loan
  let vehicles: number
  if (fd.vehicle_market_values.length > 0) {
    // :99-106, per-vehicle list (Python list truthiness)
    vehicles = 0
    fd.vehicle_market_values.forEach((marketValue, index) => {
      const loan = index < fd.vehicle_loan_balances.length ? fd.vehicle_loan_balances[index] : 0
      let equity = pyMax(marketValue * 0.8 - loan, 0)
      if (index === 0 || (index === 1 && fd.filing_joint_offer)) {
        equity = pyMax(equity - 3450, 0) // :105, lines 6a and 6c: $3,450 exemption
      }
      vehicles += equity
    })
  } else {
    // :108-111, legacy totals
    const vehiclesRaw = pyMax(fd.vehicle_market_value_total * 0.8 - fd.vehicle_loan_balance_total, 0)
    const exemptVehicles = pyMin(fd.vehicle_count, fd.filing_joint_offer ? 2 : 1)
    vehicles = pyMax(vehiclesRaw - 3450 * exemptVehicles, 0) // :111, $3,450 per exempt vehicle
  }
  const other_assets = pyMax(
    fd.other_valuable_assets_value * 0.8 - fd.other_valuable_assets_loan - 11980,
    0
  ) // :112-113, line 7: ×0.8 minus $11,980 deduction
  return { cash, investments, retirement, life_insurance, real_property, vehicles, other_assets }
}

// determination.py:115 — the seven lines added in Python's order.
export function calculateNetRealizableEquity(fd: FinancialData): number {
  const l = netRealizableEquityLines(fd)
  return l.cash + l.investments + l.retirement + l.life_insurance + l.real_property + l.vehicles + l.other_assets
}

// STEP 5 — determination.py:121-128, Section 9 gates.
export function passesComplianceGate(fd: FinancialData): [boolean, string[]] {
  const reasons: string[] = []
  if (!fd.all_returns_filed) reasons.push('Not all required tax returns are filed.')
  if (fd.in_open_bankruptcy) reasons.push('Currently in an open bankruptcy proceeding.')
  return [reasons.length === 0, reasons]
}

export interface Determination {
  path: string
  reason: string
  monthly_income: number
  monthly_expenses: number
  net_disposable_income: number
  net_realizable_equity: number
  suggested_offer_or_payment: number
  needs_manual_review: boolean
  review_notes: string[]
}

// STEP 6 — determination.py:147-228, the decision tree. path/reason strings are verbatim,
// double-quoted as in Python so a search for the Python literal finds them here too.
export function determineResolutionPath(
  fd: FinancialData,
  repo: StandardsRepository
): Determination {
  const grossIncome = calculateGrossMonthlyIncome(fd)
  const expenses = calculateAllowableExpenses(fd, repo).total
  let ndi = grossIncome - expenses
  const nre = calculateNetRealizableEquity(fd)
  const figures = () => ({
    monthly_income: grossIncome,
    monthly_expenses: expenses,
    net_disposable_income: ndi,
    net_realizable_equity: nre,
  })

  const [ok, gateReasons] = passesComplianceGate(fd)
  if (!ok) {
    return {
      path: "BLOCKED — Compliance gate failed",
      reason: gateReasons.join('; '),
      ...figures(),
      suggested_offer_or_payment: 0.0,
      needs_manual_review: true,
      review_notes: gateReasons,
    }
  }

  ndi = pyMax(ndi, 0) // :169, a negative NDI never becomes a negative payment

  // :172, CNC: no income left and equity of $500 or less.
  if (ndi <= 0 && nre <= 500) {
    return {
      path: "Currently Not Collectible (CNC / Status 53)",
      reason: "Allowable expenses consume all income and there is no meaningful equity to liquidate.",
      ...figures(),
      suggested_offer_or_payment: 0.0,
      needs_manual_review: false,
      review_notes: [],
    }
  }

  // :182, no income but equity above $500: judgment call.
  if (ndi <= 0 && nre > 500) {
    return {
      path: "MANUAL REVIEW — negative income, meaningful equity present",
      reason:
        "No monthly disposable income, but realizable equity exceeds $500. "
        + "Decide whether to pursue a lump-sum OIC funded by that equity or hardship CNC.",
      ...figures(),
      suggested_offer_or_payment: nre,
      needs_manual_review: true,
      review_notes: ['Equity-funded OIC vs. CNC judgment call — see IRM 5.8.5.'],
    }
  }

  const csedMonths = pyMax(fd.csed_months_remaining, 1) // :194, clamp to at least 1 month
  // :196-197, full pay by CSED, rounded up to the cent.
  const fullPayAmount = (months: number): number =>
    Math.ceil((fd.total_tax_owed / months) * 100) / 100
  const csedPayment = fullPayAmount(csedMonths)

  // :201-202, Simple Payment Plan: balance of $50,000 or less paid by the CSED.
  if (fd.csed_months_remaining > 0 && fd.total_tax_owed <= 50_000 && ndi >= csedPayment) {
    return {
      path: "Simple Payment Plan",
      reason: "Full balance is $50,000 or less and the proposed payment pays it by the CSED.",
      ...figures(),
      suggested_offer_or_payment: csedPayment,
      needs_manual_review: false,
      review_notes: [],
    }
  }

  // :212, full pay by the CSED outside the simple-plan rules.
  if (fd.csed_months_remaining > 0 && ndi >= csedPayment) {
    return {
      path: "Non-Simple Installment Agreement",
      reason:
        "The full balance can be paid by the CSED, but the case does not meet the simpler plan rules.",
      ...figures(),
      suggested_offer_or_payment: csedPayment,
      needs_manual_review: false,
      review_notes: [],
    }
  }

  return {
    path: "MANUAL REVIEW — payment resolution needs review",
    reason: "The available data does not support an automatic payment-resolution selection.",
    ...figures(),
    suggested_offer_or_payment: 0.0,
    needs_manual_review: true,
    review_notes: [],
  }
}
