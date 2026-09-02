import { arrayMove } from '@dnd-kit/sortable'
import type { Message } from '../app/chatTypes'

export function reorderMessages(
  messages: Message[],
  activeId: string,
  overId: string,
): Message[] {
  const from = messages.findIndex((message) => message.id === activeId)
  const to = messages.findIndex((message) => message.id === overId)
  if (from < 0 || to < 0 || from === to) return messages
  return arrayMove(messages, from, to)
}
