// Port of _pay_stub, _PAY_FREQUENCY and _TAX_LINES in src/document_parse.py.
import {
  absDec,
  dec,
  ExtractError,
  firstLabeled,
  labeledAmount,
  pairs,
  requireLabels,
  strip,
  sumDec,
  toMonthly,
} from './fields'

export const PAY_FREQUENCY: Record<string, string> = {
  weekly: 'weekly',
  biweekly: 'biweekly',
  everytwoweeks: 'biweekly',
  semimonthly: 'semimonthly',
  twiceamonth: 'semimonthly',
  monthly: 'monthly',
}

export const TAX_LINES = ['Federal Income Tax', 'Social Security Tax', 'Medicare Tax', 'State Income Tax']

export const payStub = (texts: readonly string[]) => {
  const raw = requireLabels(pairs(texts), 'Pay Frequency').get('Pay Frequency')!
  const frequency = PAY_FREQUENCY[raw.toLowerCase().replaceAll('-', '').replaceAll(' ', '')]
  if (frequency === undefined) throw new ExtractError(`Unknown pay frequency ${raw}`)
  const gross = dec(firstLabeled(texts, 'Regular Gross Pay', 'Gross Pay'))
  const taxes = sumDec(TAX_LINES.map((label) => labeledAmount(texts, label)))
  return {
    _employer: strip(texts[0]),
    pay_frequency: frequency,
    gross_wages_taxpayer: toMonthly(gross, frequency),
    actual_current_taxes: toMonthly(absDec(taxes), frequency),
  }
}
