import type { TransactionRow } from './api'

export interface SpendingGroup {
  label: string
  count: number
  total: number
  monthly: number
}

export interface SpendingSummary {
  months: 3 | 6
  currency: string | null
  expenses: SpendingGroup[]
  income: SpendingGroup | null
}

// Plaid's FOOD_AND_DRINK -> Food and drink; null -> Uncategorized.
export function humanizeCategory(category: string | null): string {
  if (!category) return 'Uncategorized'
  const text = category.toLowerCase().replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Plaid v2 detailed categories a case manager reads first (433-A housing, vehicle and utility lines).
// Everything else groups under its humanized primary category.
const DETAILED: Record<string, string> = {
  RENT_AND_UTILITIES_RENT: 'Rent',
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: 'Mortgage',
  LOAN_PAYMENTS_CAR_PAYMENT: 'Car payment',
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: 'Utilities',
  RENT_AND_UTILITIES_WATER: 'Utilities',
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: 'Utilities',
  RENT_AND_UTILITIES_OTHER_UTILITIES: 'Utilities',
  RENT_AND_UTILITIES_TELEPHONE: 'Phone, internet and cable',
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: 'Phone, internet and cable',
  GENERAL_SERVICES_INSURANCE: 'Insurance',
  TRANSPORTATION_GAS: 'Fuel',
  LOAN_PAYMENTS_STUDENT_LOAN: 'Student loan',
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: 'Credit card payments',
}

const cents = (n: number) => Math.round(n * 100) / 100

export const groupLabel = (t: Pick<TransactionRow, 'category_primary' | 'category_detailed'>): string =>
  (t.category_detailed && DETAILED[t.category_detailed]) || humanizeCategory(t.category_primary)

// Settled rows only (a pending charge can still reverse). Plaid signs: positive leaves the account.
// The Worker window starts on the first day of the month `months` back and runs to today, so it holds
// `months` full months plus the current partial one. The partial month is left out and totals divide
// by `months`, so a rent paid monthly shows once per month, the shape the 433-A asks for.
export function summarizeSpending(rows: TransactionRow[], months: 3 | 6, now = new Date()): SpendingSummary {
  const currentMonth = now.toISOString().slice(0, 7)
  const settled = rows.filter((t) => !t.pending && t.date.slice(0, 7) < currentMonth)
  const groups = new Map<string, SpendingGroup>()
  let income: SpendingGroup | null = null
  for (const t of settled) {
    if (t.amount > 0) {
      const label = groupLabel(t)
      const g = groups.get(label) ?? { label, count: 0, total: 0, monthly: 0 }
      g.count += 1
      g.total += t.amount
      groups.set(label, g)
    } else if (t.amount < 0 && t.category_primary === 'INCOME') {
      income ??= { label: 'Income deposits', count: 0, total: 0, monthly: 0 }
      income.count += 1
      income.total += -t.amount
    }
  }
  const finish = (g: SpendingGroup): SpendingGroup => ({ ...g, total: cents(g.total), monthly: cents(g.total / months) })
  return {
    months,
    currency: rows.find((t) => t.iso_currency_code)?.iso_currency_code ?? null,
    expenses: [...groups.values()].map(finish).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    income: income && finish(income),
  }
}
