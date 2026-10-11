// Port of _business in src/document_parse.py.
import { money, pairs, pick } from './fields'

export const business = (texts: readonly string[]) => ({
  _kind: 'business',
  net_business_income: money(pick(pairs(texts), 'Net Income', 'Net Profit')),
})
