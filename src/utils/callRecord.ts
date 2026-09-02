import type { CallRecord } from '../app/chatTypes'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatCallRecord(call: CallRecord): string {
  if (call.status === 'cancelled') return '已取消'
  if (call.status === 'missed') return '未接听'
  if (call.status === 'unanswered') return '对方无应答'

  const total = Math.max(0, Math.floor(call.durationSeconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `通话时长 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `通话时长 ${pad(minutes)}:${pad(seconds)}`
}
