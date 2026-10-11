import { expect, it } from 'vitest'
import { formatMoney } from './money'

it('money out shows a Unicode minus', () => expect(formatMoney(12.34, 'USD')).toBe('−$12.34'))
it('money in shows a plus', () => expect(formatMoney(-50, 'USD')).toBe('+$50.00'))
it('zero defaults to USD with no sign', () => expect(formatMoney(0, null)).toBe('$0.00'))
it('groups thousands', () => expect(formatMoney(1234.5, 'USD')).toBe('−$1,234.50'))
