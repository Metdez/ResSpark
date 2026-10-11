// 1:1 port of STEP 6 of src/determination.py: Determination and determine_resolution_path.
// path/reason/check strings are verbatim, double-quoted as in Python so a search for the
// Python literal finds them here too.
import {
  calculateAllowableExpenses,
  calculateGrossMonthlyIncome,
  calculateNetRealizableEquity,
  passesComplianceGate,
} from './determination'
import type { FinancialData } from './financial-data'
import { pyFixed, pyMax, wholeDollars } from './py'
import type { StandardsRepository } from './standards'
import { buildTrace, check, step, type TraceSection, type TraceStep } from './trace'

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
  calculation_trace: TraceSection[]
}

// determination.py:299-449, the decision tree.
export function determineResolutionPath(
  fd: FinancialData,
  repo: StandardsRepository
): Determination {
  const expenseSteps: TraceStep[] = []
  const equitySteps: TraceStep[] = []
  const grossIncome = calculateGrossMonthlyIncome(fd)
  const expenses = calculateAllowableExpenses(fd, repo, expenseSteps).total
  const rawNdi = grossIncome - expenses
  const nre = calculateNetRealizableEquity(fd, equitySteps)
  const [ok, gateReasons] = passesComplianceGate(fd)
  // A negative NDI never becomes a negative payment, except on the blocked path.
  const ndi = !ok ? rawNdi : pyMax(rawNdi, 0)

  const csedMonths = pyMax(fd.csed_months_remaining, 1) // clamp to at least 1 month
  // Full pay by CSED, rounded up to the cent.
  const csedPayment = Math.ceil((fd.total_tax_owed / csedMonths) * 100) / 100
  // Form 656-B minimum offers: equity plus 12 (lump sum) or 24 (periodic) months of income.
  const lumpSum = wholeDollars(nre + pyMax(rawNdi, 0) * 12)
  const periodic = wholeDollars(nre + pyMax(rawNdi, 0) * 24)

  const simpleMatch = fd.csed_months_remaining > 0 && fd.total_tax_owed <= 50_000 && ndi >= csedPayment
  const fullPayMatch = fd.csed_months_remaining > 0 && ndi >= csedPayment
  let selected: number
  if (!ok) selected = 0
  else if (ndi <= 0 && nre <= 500) selected = 1 // CNC: no income left, equity of $500 or less
  else if (ndi <= 0 && nre > 500) selected = 2 // equity above $500: judgment call
  else if (simpleMatch) selected = 3 // balance of $50,000 or less paid by the CSED
  else if (fullPayMatch) selected = 4
  else if (lumpSum > 0 && lumpSum < fd.total_tax_owed) selected = 5
  else selected = 6

  const checkDetails: [string, string][] = [
    ["Compliance gate", "All required returns are filed and no open bankruptcy blocks collection resolution."],
    ["Currently Not Collectible", `Disposable income is $0 or less and realizable equity is $500 or less (income $${pyFixed(ndi, 2)}; equity $${pyFixed(nre, 2)}).`],
    ["Equity review", `Disposable income is $0 or less while realizable equity exceeds $500 (equity $${pyFixed(nre, 2)}).`],
    ["Simple Payment Plan", `Balance is $50,000 or less and $${pyFixed(csedPayment, 2)} per month full-pays it by the CSED.`],
    ["Non-Simple Installment Agreement", `$${pyFixed(csedPayment, 2)} per month full-pays the balance by the CSED.`],
    ["Offer in Compromise", `Equity plus 12 months of remaining income is $${pyFixed(lumpSum, 0)}, below the $${pyFixed(fd.total_tax_owed, 2)} balance.`],
    ["Manual payment review", "No automatic path matched the available facts."],
  ]
  const checks = checkDetails.map(([label, detail], index) => {
    let status: string
    if (index > selected) status = 'not_evaluated'
    else if (index === selected) status = 'matched'
    else if (index === 0) status = 'pass'
    else status = 'fail'
    return check(label, detail, status)
  })

  const result = (
    path: string, reason: string, suggested: number, manual = false, notes: string[] | null = null
  ): Determination => {
    const calculationTrace = buildTrace(
      fd, grossIncome, expenses, rawNdi, ndi, nre, [...expenseSteps], [...equitySteps], checks
    )
    calculationTrace.splice(4, 0, {
      id: 'resolution_amounts',
      title: 'Resolution amount calculations',
      description: 'Full-pay and Form 656-B offer amounts used by the decision tree.',
      steps: [
        step(
          'Full-pay monthly requirement', 'Round total balance / CSED months up to the next cent',
          csedPayment, [['Total balance', fd.total_tax_owed], ['CSED months', csedMonths]],
          ['total_tax_owed', 'csed_months_remaining']
        ),
        step(
          'Lump-sum OIC minimum', 'Whole dollars: equity + 12 months of remaining income',
          lumpSum, [['Equity', nre], ['Monthly remaining income', pyMax(rawNdi, 0)], ['Months', 12]],
          ['total_tax_owed']
        ),
        step(
          'Periodic-payment OIC minimum', 'Whole dollars: equity + 24 months of remaining income',
          periodic, [['Equity', nre], ['Monthly remaining income', pyMax(rawNdi, 0)], ['Months', 24]],
          ['total_tax_owed']
        ),
        step(
          'Selected offer or payment', 'Amount returned by the matched resolution path',
          suggested, [['Selected amount', suggested]], [], 'currency'
        ),
      ],
    })
    return {
      path,
      reason,
      monthly_income: grossIncome,
      monthly_expenses: expenses,
      net_disposable_income: ndi,
      net_realizable_equity: nre,
      suggested_offer_or_payment: suggested,
      needs_manual_review: manual,
      review_notes: notes && notes.length > 0 ? notes : [],
      calculation_trace: calculationTrace,
    }
  }

  if (selected === 0) {
    return result("BLOCKED — Compliance gate failed", gateReasons.join('; '), 0.0, true, gateReasons)
  }
  if (selected === 1) {
    return result(
      "Currently Not Collectible (CNC / Status 53)",
      "Allowable expenses consume all income and there is no meaningful equity to liquidate.",
      0.0
    )
  }
  if (selected === 2) {
    return result(
      "MANUAL REVIEW — negative income, meaningful equity present",
      "No monthly disposable income, but realizable equity exceeds $500. "
      + "Decide whether to pursue a lump-sum OIC funded by that equity or hardship CNC.",
      nre, true, ["Equity-funded OIC vs. CNC judgment call — see IRM 5.8.5."]
    )
  }
  if (selected === 3) {
    return result(
      "Simple Payment Plan",
      "Full balance is $50,000 or less and the proposed payment pays it by the CSED.",
      csedPayment
    )
  }
  if (selected === 4) {
    return result(
      "Non-Simple Installment Agreement",
      "The full balance can be paid by the CSED, but the case does not meet the simpler plan rules.",
      csedPayment
    )
  }
  if (selected === 5) {
    return result(
      "Offer in Compromise",
      "The balance cannot be full-paid by the collection deadline. "
      + "The IRS lump-sum minimum offer is equity plus 12 months of remaining income.",
      lumpSum, false, [`The 6-to-24-month minimum offer is $${pyFixed(periodic, 0)}.`]
    )
  }
  return result(
    "MANUAL REVIEW — payment resolution needs review",
    "The available data does not support an automatic payment-resolution selection.",
    0.0, true
  )
}
