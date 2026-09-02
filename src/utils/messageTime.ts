import type { Message, TimeDisplayMode } from '../app/chatTypes'

const FIVE_MINUTES = 5 * 60 * 1000
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function shouldShowMessageTime(
  messages: Message[],
  index: number,
  mode: TimeDisplayMode,
): boolean {
  if (mode === 'hidden' || index < 0 || index >= messages.length) return false
  if (messages[index].timeVisibility === 'hide') return false
  const current = new Date(messages[index].sentAt).getTime()
  if (!Number.isFinite(current)) return false
  if (messages[index].timeVisibility === 'show') return true
  if (index === 0) return true
  const previous = new Date(messages[index - 1].sentAt).getTime()
  return Number.isFinite(previous) && current - previous >= FIVE_MINUTES
}

function daySerial(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

export function formatMessageTime(sentAt: string, now = new Date()): string {
  const value = new Date(sentAt)
  if (Number.isNaN(value.getTime())) return ''

  const hhmm = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value)
  const dayDelta = Math.round((daySerial(now) - daySerial(value)) / 86_400_000)

  if (dayDelta === 0) return hhmm
  if (dayDelta === 1) return `昨天 ${hhmm}`
  if (dayDelta >= 2 && dayDelta <= 6) return `${WEEKDAYS[value.getDay()]} ${hhmm}`
  if (value.getFullYear() === now.getFullYear()) {
    return `${value.getMonth() + 1}月${value.getDate()}日 ${hhmm}`
  }
  return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日 ${hhmm}`
}
