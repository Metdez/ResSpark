// Port of _account_transcript and _wage_transcript in src/document_parse.py.
import {
  add,
  cents,
  dec,
  ExtractError,
  monthsBetween,
  money,
  nextMoney,
  pairs,
  pyDate,
  requireLabels,
  stateCode,
  StopIteration,
  strip,
  toFloat,
  ZERO,
} from './fields'

export const accountTranscript = (texts: readonly string[]) => {
  const found = requireLabels(pairs(texts), 'Filing Status', 'Address', '(CSED)', 'Request Date')
  const balanceLine = texts.find((text) => text.startsWith('ACCOUNT BALANCE'))
  if (balanceLine === undefined) throw new StopIteration()
  let taxOnly = ZERO
  texts.forEach((text, index) => {
    if (strip(text) === '150') taxOnly = add(taxOnly, dec(nextMoney(texts, index)))
  })
  return {
    filing_status_married: found.get('Filing Status')!.toLowerCase().startsWith('married'),
    state_of_residence: stateCode(found.get('Address')!),
    total_tax_owed: money(balanceLine.split(':').at(-1)!),
    // quantize(Decimal("0.01")) uses the context default, ROUND_HALF_EVEN.
    tax_only_balance: toFloat(cents(taxOnly, 1n, false)),
    csed_months_remaining: monthsBetween(pyDate(found.get('Request Date')!), pyDate(found.get('(CSED)')!)),
  }
}

export const wageTranscript = (texts: readonly string[]) => {
  const index = texts.findIndex((text) => text.startsWith('Box 1'))
  if (index < 0) throw new ExtractError('Wage transcript has no Box 1 wages')
  const boxOne = dec(nextMoney(texts, index))
  const filed = texts.find((text) => text.includes('filed by:'))
  if (filed === undefined) throw new StopIteration()
  return {
    _employer: strip(filed.slice(filed.indexOf('filed by:') + 'filed by:'.length)),
    gross_wages_taxpayer: toFloat(cents(boxOne, 12n, true)),
  }
}
