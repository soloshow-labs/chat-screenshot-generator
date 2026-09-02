import type { Message, MessageQuote, Participant } from '../app/chatTypes'
import { createMessageQuoteSnapshot } from '../app/messageDomain'

export function createQuoteSnapshot(message: Message, sender: Participant): MessageQuote | null {
  return createMessageQuoteSnapshot(message, sender.name)
}
