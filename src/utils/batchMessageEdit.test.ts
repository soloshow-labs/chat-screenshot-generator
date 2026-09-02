import { describe, expect, it } from 'vitest'
import { createMessage } from '../app/messageFactory'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { applyBatchMessageEdit, validateBatchMessageEdit } from './batchMessageEdit'

function batchDraft() {
  return {
    ...SAMPLE_DRAFT,
    messages: [
      createMessage('self', { id: 'm1', sentAt: '2026-12-31T23:58:00.000Z' }),
      createMessage('p2', { id: 'm2', sentAt: '2027-01-01T00:00:00.000Z' }),
      createMessage('p2', { id: 'm3', sentAt: '2027-01-01T00:02:00.000Z', side: 'left', quote: { sourceMessageId: 'm1', senderName: '小美', kind: 'text', text: '快跨年了', media: null } }),
    ],
  }
}

describe('batch message editing', () => {
  it('changes non-contiguous senders and preserves the relative time gap', () => {
    const draft = batchDraft()
    const after = applyBatchMessageEdit(draft, { messageIds: ['m1', 'm3'], participantId: 'p3', firstSentAt: '2027-01-01T00:00:00.000Z' })

    expect(after.messages[0]).toMatchObject({ participantId: 'p3', sentAt: '2027-01-01T00:00:00.000Z' })
    expect(after.messages[2]).toMatchObject({ participantId: 'p3', sentAt: '2027-01-01T00:04:00.000Z', side: 'left', quote: draft.messages[2].quote })
    expect(after.messages[1]).toBe(draft.messages[1])
  })

  it('supports a negative shift across the year boundary', () => {
    const draft = batchDraft()
    const after = applyBatchMessageEdit(draft, { messageIds: ['m2', 'm3'], firstSentAt: '2026-12-31T23:57:00.000Z' })

    expect(after.messages[1].sentAt).toBe('2026-12-31T23:57:00.000Z')
    expect(after.messages[2].sentAt).toBe('2026-12-31T23:59:00.000Z')
  })

  it('does not partially apply invalid senders or dates', () => {
    const draft = batchDraft()
    expect(validateBatchMessageEdit(draft, { messageIds: ['m1'], participantId: 'missing' })).toMatch('发送人')
    expect(validateBatchMessageEdit(draft, { messageIds: ['m1'], firstSentAt: 'not-a-date' })).toMatch('日期时间')
    expect(applyBatchMessageEdit(draft, { messageIds: ['m1'], participantId: 'missing' })).toBe(draft)
  })

  it('clears re-edit links only when recalled messages move away from self', () => {
    const draft = { ...batchDraft(), messages: [createMessage('self', { id: 'recall', kind: 'recall', showReeditLink: true }), ...batchDraft().messages.slice(1)] }
    const after = applyBatchMessageEdit(draft, { messageIds: ['recall'], participantId: 'p2' })

    expect(after.messages[0]).toMatchObject({ participantId: 'p2', showReeditLink: false })
  })

  it('returns the original draft when enabled fields make no effective change', () => {
    const draft = batchDraft()
    expect(applyBatchMessageEdit(draft, { messageIds: ['m1'], participantId: 'self', firstSentAt: '2026-12-31T23:58:00.000Z' })).toBe(draft)
  })
})
