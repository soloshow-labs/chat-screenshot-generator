import type { Message } from '../app/chatTypes'

export interface CaptureRangeResult {
  valid: boolean
  messages: Message[]
  startIndex: number
  endIndex: number
}

export function resolveCaptureRange(
  messages: Message[],
  startId: string | null,
  endId: string | null,
): CaptureRangeResult {
  if (messages.length === 0) {
    return { valid: true, messages: [], startIndex: 0, endIndex: -1 }
  }
  const startIndex = startId === null ? 0 : messages.findIndex((message) => message.id === startId)
  const endIndex = endId === null ? messages.length - 1 : messages.findIndex((message) => message.id === endId)
  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) {
    return { valid: false, messages: [], startIndex: -1, endIndex: -1 }
  }
  return {
    valid: true,
    messages: messages.slice(startIndex, endIndex + 1),
    startIndex,
    endIndex,
  }
}
