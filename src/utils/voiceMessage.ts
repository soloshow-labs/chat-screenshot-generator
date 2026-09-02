import type { Message } from '../app/chatTypes'

export function getVoiceDuration(message: Message): number {
  if (message.voice?.durationMode === 'manual') return message.voice.durationSeconds
  return Math.ceil(message.media?.durationSeconds ?? 0)
}
