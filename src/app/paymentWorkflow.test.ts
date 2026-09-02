import { describe, expect, it } from 'vitest'
import { chatReducer } from './chatReducer'
import { createHistory, historyReducer } from './chatHistory'
import type { ChatDraft, PaymentPayload } from './chatTypes'
import { createMessage, messageKindPatch } from './messageFactory'
import { SAMPLE_DRAFT } from './sampleDraft'
import { isChatDraft } from '../services/draftStore'
import { applyGroupPreset } from '../utils/applyGroupPreset'

function original(mode: PaymentPayload['mode'] = 'transfer'): ChatDraft {
  return { ...structuredClone(SAMPLE_DRAFT), messages: [createMessage('p2', {
    id: 'pay', kind: 'payment', sentAt: '2026-08-31T10:00:00Z',
    payment: { mode, status: 'pending', amount: 88, note: '聚餐', role: 'original', payerId: 'p2', receiverId: 'self', payerName: '阿花', receiverName: '小美', sourceMessageId: null },
  })] }
}
const response = { type: 'respond-payment' as const, messageId: 'pay', newId: 'reply', outcome: 'received' as const, receiverId: 'self', sentAt: '2026-08-31T10:01:00Z' }

describe('payment workflow integration', () => {
  it.each([['transfer', 'received', 'receipt'], ['transfer', 'refunded', 'receipt'], ['red-packet', 'received', 'notice']] as const)('records %s/%s and its %s in one undo transaction', (mode, outcome, role) => {
    const draft = original(mode)
    let history = createHistory(draft)
    expect(() => { history = historyReducer(history, { type: 'edit', action: { ...response, outcome }, timestamp: 1 }) }).not.toThrow()
    expect(history.present.messages).toHaveLength(2)
    expect(history.present.messages[0].payment?.status).toBe(outcome)
    expect(history.present.messages[1]).toMatchObject({ id: 'reply', participantId: 'self', kind: 'payment', side: 'auto', payment: { role, amount: 88, payerName: '阿花', receiverName: '小美', sourceMessageId: 'pay' } })
    expect(history.past).toHaveLength(1)
    expect(isChatDraft(history.present)).toBe(true)
    const undone = historyReducer(history, { type: 'undo' })
    expect(undone.present).toEqual(draft)
    expect(historyReducer(undone, { type: 'redo' }).present).toEqual(history.present)
    expect(chatReducer(history.present, { ...response, newId: 'duplicate' })).toBe(history.present)
  })

  it('initializes new payment actors using sender and direct-chat counterpart, not visual side', () => {
    const direct = { ...original(), conversationType: 'direct' as const, participants: SAMPLE_DRAFT.participants.slice(0, 2), messages: [createMessage('p2', { id: 'text', side: 'right' })] }
    const converted = chatReducer(direct, { type: 'update-message', messageId: 'text', patch: messageKindPatch('payment') })
    expect(converted.messages[0].payment).toMatchObject({ role: 'original', payerId: 'p2', payerName: '阿花', receiverId: 'self', receiverName: '小美' })
    const group = chatReducer(SAMPLE_DRAFT, { type: 'add-message', message: createMessage('self', { kind: 'payment' }) })
    expect(group.messages.at(-1)?.payment).toMatchObject({ role: 'original', payerId: 'self', receiverId: null })
    expect(isChatDraft(group)).toBe(true)
    expect(messageKindPatch('location').location).toMatchObject({ mapDataUrl: null })
  })

  it('keeps actor snapshots when members are renamed, source amount changes or display side changes', () => {
    const handled = chatReducer(original(), response)
    const renamed = chatReducer(handled, { type: 'update-participant', participantId: 'p2', patch: { name: '新名字' } })
    const changed = chatReducer(renamed, { type: 'update-message', messageId: 'pay', patch: { side: 'right', participantId: 'self', payment: { ...renamed.messages[0].payment!, amount: 999 } } })
    expect(changed.messages[1].payment).toMatchObject({ payerName: '阿花', amount: 88, note: '聚餐' })
    expect(changed.messages[0].payment?.payerId).toBe('p2')
  })

  it('detaches copied responses and source deletion without losing their content', () => {
    const handled = chatReducer(original(), response)
    const copied = chatReducer(handled, { type: 'duplicate-message', messageId: 'reply', newId: 'copy' })
    expect(copied.messages[2].payment).toMatchObject({ role: 'receipt', sourceMessageId: null, payerName: '阿花', amount: 88 })
    const removed = chatReducer(copied, { type: 'delete-message', messageId: 'pay' })
    expect(removed.messages).toHaveLength(2)
    expect(removed.messages.every(message => message.payment?.sourceMessageId === null)).toBe(true)
    expect(isChatDraft(removed)).toBe(true)
  })

  it('preserves historical actors when deleting a member with a replacement sender', () => {
    const handled = chatReducer(original(), response)
    const removed = chatReducer(handled, { type: 'remove-participant', participantId: 'p2', replacementId: 'p3' })
    expect(removed.messages[0].participantId).toBe('p3')
    for (const message of removed.messages) expect(message.payment).toMatchObject({ payerId: null, payerName: '阿花', receiverId: 'self' })
    expect(isChatDraft(removed)).toBe(true)
  })

  it('normalizes surviving snapshots after group template replacement and direct-chat filtering', () => {
    const handled = chatReducer(original('red-packet'), response)
    const preset = { id: 'preset', title: '新群', participants: handled.participants.filter(person => person.id !== 'p2'), createdAt: Date.now(), updatedAt: Date.now() }
    const applied = applyGroupPreset(handled, preset)
    expect(applied.removedMessageCount).toBe(1)
    expect(applied.draft.messages[0].payment).toMatchObject({ role: 'notice', sourceMessageId: null, payerId: null, payerName: '阿花' })
    expect(isChatDraft(applied.draft)).toBe(true)
    const replaced = chatReducer(handled, { type: 'replace-draft', draft: { ...applied.draft, conversationType: 'direct' } })
    expect(isChatDraft(replaced)).toBe(true)
  })

  it('detaches response links if the original changes payment mode or message type', () => {
    const handled = chatReducer(original(), response)
    const modeChanged = chatReducer(handled, { type: 'update-message', messageId: 'pay', patch: { payment: { ...handled.messages[0].payment!, mode: 'red-packet' } } })
    expect(modeChanged.messages[1].payment?.sourceMessageId).toBeNull()
    const kindChanged = chatReducer(handled, { type: 'update-message', messageId: 'pay', patch: messageKindPatch('text') })
    expect(kindChanged.messages[1].payment?.sourceMessageId).toBeNull()
    expect(isChatDraft(kindChanged)).toBe(true)
  })
})
