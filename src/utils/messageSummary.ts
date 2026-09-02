import type { Message } from '../app/chatTypes'
import { summarizeMessage } from '../app/messageDomain'

export function messageOptionLabel(message: Message, index: number): string {
  return `${index + 1}. ${summarizeMessage(message).slice(0, 24)}`
}
