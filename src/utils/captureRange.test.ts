import { describe, expect, it } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { resolveCaptureRange } from './captureRange'

const messages = SAMPLE_DRAFT.messages.slice(0, 5)

describe('resolveCaptureRange', () => {
  it.each([
    [null, null, true, ['m1', 'm2', 'm3', 'm4', 'm5'], 0, 4],
    ['m2', 'm4', true, ['m2', 'm3', 'm4'], 1, 3],
    ['m3', 'm3', true, ['m3'], 2, 2],
    [null, 'm2', true, ['m1', 'm2'], 0, 1],
    ['m4', null, true, ['m4', 'm5'], 3, 4],
  ] as const)('resolves %s through %s inclusively', (startId, endId, valid, ids, startIndex, endIndex) => {
    const result = resolveCaptureRange(messages, startId, endId)
    expect(result.valid).toBe(valid)
    expect(result.messages.map((message) => message.id)).toEqual(ids)
    expect(result.startIndex).toBe(startIndex)
    expect(result.endIndex).toBe(endIndex)
  })

  it.each([
    ['missing', null],
    [null, 'missing'],
    ['m4', 'm2'],
  ] as const)('rejects an invalid range from %s through %s', (startId, endId) => {
    expect(resolveCaptureRange(messages, startId, endId)).toEqual({
      valid: false,
      messages: [],
      startIndex: -1,
      endIndex: -1,
    })
  })
})
