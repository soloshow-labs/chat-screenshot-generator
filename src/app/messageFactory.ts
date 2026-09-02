import type { Message, MessageKind } from './chatTypes'
import { createMessageKindPatch } from './messageDomain'

export function messageKindPatch(kind: MessageKind): Partial<Message> {
  return createMessageKindPatch(kind)
}

export function createMessage(participantId: string, overrides: Partial<Message> = {}): Message {
  const defaults = messageKindPatch(overrides.kind ?? 'text')
  const message: Message = {
    id: crypto.randomUUID(), participantId, kind: 'text', deliveryStatus: 'sent', text: '', showReeditLink: false,
    media: null, quote: null, voice: null, voiceUnread: false, call: null, side: 'auto', sentAt: new Date().toISOString(), timeVisibility: 'auto',
    ...defaults, ...overrides,
  }
  for (const field of ['call', 'voice', 'link', 'payment', 'contactCard', 'location', 'system'] as const) {
    if (defaults[field] && !message[field]) Object.assign(message, { [field]: defaults[field] })
  }
  return message
}
