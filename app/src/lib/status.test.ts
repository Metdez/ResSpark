import { describe, expect, it } from 'vitest'
import {
  OVERDUE_BADGE,
  TONE_CLASSES,
  documentStatusBadge,
  itemStatusBadge,
  requestStatusBadge,
} from './status'

describe('requestStatusBadge', () => {
  it.each([
    ['draft', 'neutral', 'Draft'],
    ['sent', 'neutral', 'Sent'],
    ['opened', 'info', 'Opened'],
    ['in_progress', 'info', 'In progress'],
    ['waiting_on_staff', 'warning', 'Waiting on staff'],
    ['complete', 'success', 'Complete'],
    ['revoked', 'muted', 'Revoked'],
  ])('%s → %s %s', (status, tone, label) => {
    expect(requestStatusBadge(status)).toEqual({ tone, label })
  })

  it('falls back to neutral with the raw string for an unknown status', () => {
    expect(requestStatusBadge('archived')).toEqual({
      tone: 'neutral',
      label: 'archived',
    })
  })
})

describe('itemStatusBadge', () => {
  it.each([
    ['pending', 'staff', 'neutral', 'Not started'],
    ['in_progress', 'staff', 'info', 'In progress'],
    ['submitted', 'staff', 'warning', 'Needs review'],
    ['approved', 'staff', 'success', 'Approved'],
    ['rejected', 'staff', 'destructive', 'Rejected'],
    ['pending', 'client', 'neutral', 'Not started'],
    ['submitted', 'client', 'warning', 'With your agent'],
    ['approved', 'client', 'success', 'Done'],
    ['rejected', 'client', 'destructive', 'Needs attention'],
  ] as const)('%s for %s → %s %s', (status, audience, tone, label) => {
    expect(itemStatusBadge(status, audience)).toEqual({ tone, label })
  })

  it('tells a client who uploaded that the item is with their agent', () => {
    expect(itemStatusBadge('submitted', 'client').label).toBe('With your agent')
  })

  it('falls back to neutral with the raw string for an unknown status', () => {
    expect(itemStatusBadge('lost', 'staff')).toEqual({
      tone: 'neutral',
      label: 'lost',
    })
  })
})

describe('documentStatusBadge', () => {
  it.each([
    ['uploading', 'neutral', 'Uploading'],
    ['ready', 'success', 'Ready'],
    ['rejected', 'destructive', 'Rejected'],
    ['deleted', 'muted', 'Deleted'],
    ['weird', 'neutral', 'weird'],
  ])('%s → %s %s', (status, tone, label) => {
    expect(documentStatusBadge(status)).toEqual({ tone, label })
  })
})

describe('OVERDUE_BADGE', () => {
  it('is a destructive Overdue badge', () => {
    expect(OVERDUE_BADGE).toEqual({ tone: 'destructive', label: 'Overdue' })
  })
})

describe('TONE_CLASSES', () => {
  it('copies the UI-SPEC palette verbatim', () => {
    expect(TONE_CLASSES.info).toBe(
      'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'
    )
    expect(TONE_CLASSES.success).toContain(
      'bg-emerald-50 text-emerald-700 border-emerald-200'
    )
    expect(TONE_CLASSES.neutral).toBe('bg-muted text-foreground border-border')
  })
})
