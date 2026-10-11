import { describe, expect, it } from 'vitest'
import type { EsignStage } from './api'
import { signatureChip } from './signature-status'

describe('signatureChip (D-20)', () => {
  it.each([
    ['not_started', 'neutral', 'Waiting'],
    ['waiting', 'neutral', 'Waiting'],
    ['viewed', 'info', 'Viewed'],
    ['signing', 'info', 'Signing'],
    ['signed', 'success', 'Signed'],
    ['declined', 'destructive', 'Declined'],
    ['expired', 'warning', 'Expired'],
    ['error', 'destructive', 'Needs attention'],
  ] as const)('%s -> %s %s', (stage, tone, label) => {
    expect(signatureChip(stage)).toEqual({ tone, label })
  })

  it('treats no connection as Waiting and an unknown stage as Needs attention', () => {
    expect(signatureChip(null)).toEqual({ tone: 'neutral', label: 'Waiting' })
    expect(signatureChip('mystery' as EsignStage).label).toBe('Needs attention')
  })
})
