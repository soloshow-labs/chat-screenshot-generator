import { describe, expect, it } from 'vitest'
import { fitPreviewZoom } from './previewZoom'

describe('fitPreviewZoom', () => {
  it.each([
    [258, 0.6],
    [215, 0.5],
  ])('returns the fitting scale for %d pixels', (availableWidth, expectedZoom) => {
    expect(fitPreviewZoom(availableWidth)).toBeCloseTo(expectedZoom)
  })

  it('does not exceed the native canvas scale', () => {
    expect(fitPreviewZoom(860)).toBe(1)
  })
})
