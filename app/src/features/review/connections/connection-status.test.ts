import { describe, expect, it } from 'vitest'
import { cellBadge, connectionBadge, employerBadge, employerCounts, transactionsLine } from './connection-status'

describe('connectionBadge', () => {
  it.each([
    ['pending', null, 'neutral', 'Waiting for client'],
    ['connected', null, 'info', 'Connected'],
    ['syncing', null, 'info', 'Syncing (bank is sending history)'],
    ['done', null, 'success', 'Done'],
    ['error', 'ITEM_LOGIN_REQUIRED', 'destructive', 'Client must reconnect'],
    ['error', 'order_expired', 'destructive', 'Order expired'],
    ['error', 'link_expired', 'destructive', 'Link timed out'],
    ['error', 'whatever', 'destructive', 'Error'],
    ['removed', null, 'muted', 'Removed'],
  ])('%s/%s', (status, code, tone, label) => {
    expect(connectionBadge(status, code)).toEqual({ tone, label })
  })
})

describe('transactionsLine', () => {
  it('never shows 0 as final while syncing', () => {
    expect(transactionsLine(0, 'not_ready')).toBe('Transactions: 0 · Syncing')
    expect(transactionsLine(0, 'initial')).toBe('Transactions: 0 · Syncing')
  })
  it('historical is up to date', () => expect(transactionsLine(412, 'historical')).toBe('Transactions: 412 · Up to date'))
  it('null is not started', () => expect(transactionsLine(0, null)).toBe('Transactions: 0 · Not started'))
})

describe('cellBadge', () => {
  it.each([
    ['available', 'success', 'Statement'],
    ['manual', 'info', 'Uploaded'],
    ['not_supported', 'muted', 'Not from bank'],
    ['missing', 'warning', 'Missing'],
    ['pending', 'neutral', 'Checking'],
    ['generated', 'info', 'From transactions'],
  ])('%s', (status, tone, label) => expect(cellBadge(status)).toEqual({ tone, label }))
})

describe('employerCounts', () => {
  it('joins non-zero counts', () =>
    expect(employerCounts({ pay_stubs: 2, w2s: 1, income_reports: 1 })).toBe('2 pay stubs · 1 W-2 · 1 income report'))
  it('omits zeros', () => expect(employerCounts({ pay_stubs: 1, w2s: 0, income_reports: 0 })).toBe('1 pay stub'))
  it('empty', () => expect(employerCounts({ pay_stubs: 0, w2s: 0, income_reports: 0 })).toBe('No documents yet'))
})

describe('employerBadge', () => {
  it.each([
    ['pending', 'neutral', 'Waiting for client'],
    ['connected', 'info', 'Connected'],
    ['done', 'success', 'Done'],
    ['error', 'destructive', 'Needs attention'],
  ])('%s', (status, tone, label) => expect(employerBadge(status)).toEqual({ tone, label }))
})
