import { describe, expect, it } from 'vitest'
import { LOGICS_MAX_PART_BYTES } from '../../../worker/src/integrations/logics/write-types'
import { LOGICS_PART_LIMIT_BYTES, planLabel, pushPlan, sizeLabel } from './plan'

const pdf = (size_bytes: number | null, name = 'a.pdf') => pushPlan({ mime: 'application/pdf', size_bytes, name })

describe('pushPlan', () => {
  it('mirrors the worker part limit', () => {
    expect(LOGICS_PART_LIMIT_BYTES).toBe(LOGICS_MAX_PART_BYTES)
  })

  it('sends a PDF at the gate as one file and splits one byte over', () => {
    expect(pdf(5_767_168)).toEqual({ kind: 'single' })
    expect(pdf(5_767_169)).toEqual({ kind: 'split', estimatedParts: 2 })
    expect(pdf(20_000_000)).toEqual({ kind: 'split', estimatedParts: 4 })
  })

  it('converts small images and splits an image over the gate', () => {
    expect(pushPlan({ mime: 'image/jpeg', size_bytes: 1_000_000, name: 'a.jpg' })).toEqual({ kind: 'image_to_pdf' })
    expect(pushPlan({ mime: 'image/png', size_bytes: 6_000_000, name: 'a.png' })).toEqual({
      kind: 'split',
      estimatedParts: 2,
    })
  })

  it('flags HEIC by mime or by extension', () => {
    const heic = { kind: 'manual', reason: 'Ask the client to re-upload as JPG or PDF.' }
    expect(pushPlan({ mime: 'image/heic', size_bytes: 1000, name: 'a' })).toEqual(heic)
    expect(pushPlan({ mime: 'image/jpeg', size_bytes: 1000, name: 'IMG_0001.HEIC' })).toEqual(heic)
  })

  it('flags oversize and unfinished files', () => {
    expect(pdf(41_943_041)).toEqual({ kind: 'manual', reason: 'over 40 MB' })
    expect(pdf(null)).toEqual({ kind: 'manual', reason: 'File not finished uploading' })
    expect(pdf(0)).toEqual({ kind: 'manual', reason: 'File not finished uploading' })
  })

  it('labels each plan', () => {
    expect(planLabel({ kind: 'single' })).toBe('Sends as 1 file')
    expect(planLabel({ kind: 'split', estimatedParts: 3 })).toBe('Will split into about 3 parts')
    expect(planLabel({ kind: 'image_to_pdf' })).toBe('Converted to PDF')
    expect(planLabel({ kind: 'manual', reason: 'over 40 MB' })).toBe('Needs manual compression — over 40 MB')
  })

  it('formats sizes like the review table', () => {
    expect(sizeLabel(2048)).toBe('2 KB')
    expect(sizeLabel(7 * 1024 * 1024)).toBe('7.0 MB')
    expect(sizeLabel(null)).toBe('—')
  })
})
