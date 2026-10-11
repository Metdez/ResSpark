// Port of _bank_statement, _statement_balance, _combine_banks and _same_payer in src/document_parse.py.
import { add, cents, dec, money, pairs, pyDate, pySplit, StopIteration, strip, sumDec, toFloat, ZERO, type Rows } from './fields'

type Part = Record<string, unknown>

const COLUMN_NAMES = new Set(['Date', 'Description', 'Withdrawals', 'Deposits', 'Balance'])
const PERIOD = /^\d{2}\/\d{2}\/\d{4} - \d{2}\/\d{2}\/\d{4}$/

export const bankStatement = (texts: readonly string[], rows: Rows) => {
  const header = rows.find(([, cells]) => {
    const seen = new Set(cells.map(([, text]) => text))
    return seen.has('Withdrawals') && seen.has('Deposits')
  })
  if (!header) throw new StopIteration()
  const [headerY, headerCells] = header
  const columns = new Map<string, number>()
  for (const [x, text] of headerCells) if (COLUMN_NAMES.has(text)) columns.set(text, x)
  const deposits: Array<[string, number]> = []
  for (const [y, cells] of rows) {
    if (y >= headerY) continue
    const buckets = new Map<string, string[]>([...columns.keys()].map((name) => [name, []]))
    for (const [x, text] of cells) {
      // min() keeps the first column on a tie.
      let nearest = ''
      let best = Infinity
      for (const [name, at] of columns) {
        if (Math.abs(at - x) < best) [nearest, best] = [name, Math.abs(at - x)]
      }
      buckets.get(nearest)!.push(text)
    }
    const descriptionCells = buckets.get('Description')
    if (!descriptionCells) throw new Error("KeyError: 'Description'")
    const description = strip(descriptionCells.join(' '))
    if (!description) continue
    for (const amount of buckets.get('Deposits')!) if (amount.includes('$')) deposits.push([description, money(amount)])
  }
  const ending = texts.find((text) => text.startsWith('Ending Balance:'))
  if (ending === undefined) throw new StopIteration()
  const period = texts.find((text) => PERIOD.test(strip(text)))
  if (period === undefined) throw new StopIteration()
  const account = pairs(texts).get('Account Number')
  if (account === undefined) throw new Error("KeyError: 'Account Number'")
  return {
    _account: account,
    _period_end: pyDate(period.split(' - ')[1]),
    _deposits: deposits,
    ending_balance: money(ending.split(':').at(-1)!),
  }
}

const statementBalance = (item: Part) => dec(('ending_balance' in item ? item.ending_balance : item.cash_and_bank_balances) as number)

export const samePayer = (description: string, employer: string): boolean => {
  const desc = pySplit(description.toLowerCase()).join(' ')
  const emp = pySplit(employer.toLowerCase()).join(' ')
  const named = desc.includes(' - ') ? desc.slice(desc.indexOf(' - ') + 3) : desc
  return desc.includes(emp) || emp.includes(desc) || emp.startsWith(named) || named.startsWith(emp)
}

export const combineBanks = (statements: readonly Part[], employers: readonly string[]): Part => {
  const latest = new Map<string, Part>()
  const loose: Part[] = []
  for (const statement of statements) {
    const account = statement._account as string | null | undefined
    const period = statement._period_end as string | null | undefined
    if (account == null || period == null) {
      loose.push(statement)
      continue
    }
    const current = latest.get(account)
    // ISO dates compare like Python date objects.
    if (current === undefined || period > (current._period_end as string)) latest.set(account, statement)
  }
  const totals = [...latest.values(), ...loose].map(statementBalance)
  const row: Part = { cash_and_bank_balances: toFloat(sumDec(totals)) }
  // No employer name means payroll cannot be told from a stranger: leave the flag unknown.
  const months = new Set(
    statements.filter((item) => '_period_end' in item).map((item) => (item._period_end as string).slice(0, 7)),
  )
  if (!employers.length || !months.size) return row
  let unexplained = ZERO
  for (const statement of statements) {
    for (const [description, amount] of (statement._deposits as Array<[string, number]> | null | undefined) ?? []) {
      if (!employers.some((employer) => samePayer(description, employer))) unexplained = add(unexplained, dec(amount))
    }
  }
  row.has_unexplained_deposits = unexplained.m > 0n
  row.unexplained_deposits_monthly = toFloat(cents(unexplained, BigInt(months.size), true))
  return row
}
