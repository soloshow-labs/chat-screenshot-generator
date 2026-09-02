import { describe, expect, it } from 'vitest'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { reorderMessages } from './messageOrder'

describe('reorderMessages', () => {
  it('moves the active message before the target position', () => {
    const messages = SAMPLE_DRAFT.messages.slice(0, 3)
    const reordered = reorderMessages(messages, 'm3', 'm1')
    expect(reordered.map((message) => message.id)).toEqual(['m3', 'm1', 'm2'])
    expect(reordered).not.toBe(messages)
  })

  it('returns the original list when either id is missing', () => {
    const messages = SAMPLE_DRAFT.messages.slice(0, 3)
    expect(reorderMessages(messages, 'missing', 'm1')).toBe(messages)
    expect(reorderMessages(messages, 'm1', 'missing')).toBe(messages)
  })
})
