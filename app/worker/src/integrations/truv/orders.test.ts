import { describe, expect, it } from 'vitest'
import { isTruvOrder, mapEmployerStatus, mapOrderStatus, summarizeEmployers, type TruvOrder } from './orders'

const order = (statuses: string[], over: Partial<TruvOrder> = {}): TruvOrder => ({
  id: 'ord_1',
  is_expired: false,
  employers: statuses.map((status, i) => ({ id: `emp_${i + 1}`, status, link_id: `link_${i + 1}`, company: { name: `Co ${i + 1}` } })),
  ...over,
})

describe('mapOrderStatus (PAY-04)', () => {
  it.each([
    [['completed', 'completed'], { status: 'done' }],
    [['completed', 'pending'], { status: 'connected' }],
    [['pending', 'sent'], { status: 'pending' }],
    [['error'], { status: 'error', code: 'employer_error' }],
    [['error', 'completed'], { status: 'done' }],
    [['completed', 'skipped'], { status: 'done' }],
    [['full_parse'], { status: 'connected' }],
    [['skipped'], { status: 'error', code: 'all_skipped' }],
    [[], { status: 'pending' }],
  ])('%j -> %j', (statuses, expected) => {
    expect(mapOrderStatus(order(statuses))).toEqual(expected)
  })

  it('an expired order with work outstanding is an error with code order_expired', () => {
    expect(mapOrderStatus(order(['pending'], { is_expired: true }))).toEqual({ status: 'error', code: 'order_expired' })
  })

  it('an expired order whose employers all completed stays done', () => {
    expect(mapOrderStatus(order(['completed'], { is_expired: true }))).toEqual({ status: 'done' })
  })
})

describe('mapEmployerStatus', () => {
  it.each([
    ['pending', 'pending'],
    ['sent', 'pending'],
    ['completed', 'done'],
    ['skipped', 'done'],
    ['error', 'error'],
    ['expired', 'error'],
    ['canceled', 'error'],
    ['no_data', 'error'],
    ['full_parse', 'connected'],
  ])('%s -> %s', (raw, mapped) => {
    expect(mapEmployerStatus(raw)).toBe(mapped)
  })
})

describe('summarizeEmployers', () => {
  it('keeps fetched_at and counts from the previous summary and adds new employers', () => {
    const previous = [
      { employer_id: 'emp_1', link_id: 'link_1', company_name: 'Co 1', status: 'connected' as const, fetched_at: 'T1', pay_stubs: 3 },
    ]
    expect(summarizeEmployers(order(['completed', 'pending']), previous)).toEqual([
      { employer_id: 'emp_1', link_id: 'link_1', company_name: 'Co 1', status: 'done', fetched_at: 'T1', pay_stubs: 3 },
      { employer_id: 'emp_2', link_id: 'link_2', company_name: 'Co 2', status: 'pending' },
    ])
  })
})

describe('isTruvOrder', () => {
  it('accepts an order and rejects malformed bodies', () => {
    expect(isTruvOrder(order(['completed']))).toBe(true)
    expect(isTruvOrder({ id: 'x' })).toBe(false)
    expect(isTruvOrder({ id: 'x', employers: [{ id: 1 }] })).toBe(false)
    expect(isTruvOrder(null)).toBe(false)
  })
})
