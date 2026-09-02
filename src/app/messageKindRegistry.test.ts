import { describe, expect, it } from 'vitest'
import type { MessageKind } from './chatTypes'
import {
  MESSAGE_KIND_OPTIONS,
  MESSAGE_KIND_REGISTRY,
  isCenteredMessage,
  isRichMessageKind,
} from './messageKindRegistry'
import { createMessage } from './messageFactory'

const allKinds: MessageKind[] = [
  'text', 'image', 'voice', 'call', 'recall', 'system',
  'link', 'video', 'file', 'payment', 'contact', 'location',
]

describe('message kind registry', () => {
  it('defines every message kind once in editor order', () => {
    expect(Object.keys(MESSAGE_KIND_REGISTRY)).toEqual(allKinds)
    expect(MESSAGE_KIND_OPTIONS.map(option => option.value)).toEqual(allKinds)
    expect(MESSAGE_KIND_OPTIONS.map(option => option.label)).toContain('转账 / 红包')
  })

  it('keeps editor, renderer and capabilities attached to each kind', () => {
    expect(MESSAGE_KIND_REGISTRY.text).toMatchObject({ editor: 'text', renderer: 'bubble', direction: true, delivery: true })
    expect(MESSAGE_KIND_REGISTRY.system).toMatchObject({ editor: 'system', renderer: 'system', direction: false, delivery: false })
    expect(MESSAGE_KIND_REGISTRY.payment).toMatchObject({ editor: 'rich', renderer: 'rich' })
    expect(isRichMessageKind('location')).toBe(true)
    expect(isRichMessageKind('voice')).toBe(false)
  })

  it('recognizes message-specific centered notices', () => {
    expect(isCenteredMessage(createMessage('self', { kind: 'system' }))).toBe(true)
    expect(isCenteredMessage(createMessage('self', { kind: 'recall' }))).toBe(true)
    expect(isCenteredMessage(createMessage('self', { kind: 'payment', payment: {
      mode: 'transfer', amount: 1, note: '', status: 'received', role: 'notice', payerId: 'self', receiverId: 'p2', payerName: '我', receiverName: '对方', sourceMessageId: null,
    } }))).toBe(true)
    expect(isCenteredMessage(createMessage('self', { kind: 'payment' }))).toBe(false)
  })
})
