import { useState, type Dispatch } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { CallRecord, Message } from '../../app/chatTypes'
import styles from './MessageEditor.module.css'

interface CallFieldsProps {
  message: Message
  number: number
  dispatch: Dispatch<ChatAction>
}

export function CallFields({ message, number, dispatch }: CallFieldsProps) {
  const [error, setError] = useState<string | null>(null)

  function updateCall(patch: Partial<CallRecord>) {
    const current = message.call ?? { mode: 'voice' as const, status: 'duration' as const, durationSeconds: 0 }
    dispatch({ type: 'update-message', messageId: message.id, patch: { call: { ...current, ...patch } } })
  }

  function updateDurationPart(part: 'hours' | 'minutes' | 'seconds', rawValue: string) {
    const currentTotal = Math.max(0, Math.floor(message.call?.durationSeconds ?? 0))
    const parts = {
      hours: Math.floor(currentTotal / 3600),
      minutes: Math.floor((currentTotal % 3600) / 60),
      seconds: currentTotal % 60,
    }
    const parsed = Math.max(0, Math.floor(Number(rawValue) || 0))
    parts[part] = part === 'hours' ? parsed : Math.min(59, parsed)
    const durationSeconds = parts.hours * 3600 + parts.minutes * 60 + parts.seconds
    if (!Number.isSafeInteger(parsed) || !Number.isSafeInteger(durationSeconds)) {
      setError('通话时长超出有效范围，请输入较小的数值')
      return
    }
    setError(null)
    updateCall({ durationSeconds })
  }

  return (
    <div className={styles.callControls}>
      {error ? <span className={styles.mediaError} role="alert">{error}</span> : null}
      <label>
        <span>通话类型</span>
        <select aria-label={`消息 ${number} 通话类型`} value={message.call?.mode ?? 'voice'} onChange={event => updateCall({ mode: event.target.value as CallRecord['mode'] })}>
          <option value="voice">语音通话</option>
          <option value="video">视频通话</option>
        </select>
      </label>
      <label>
        <span>通话状态</span>
        <select aria-label={`消息 ${number} 通话状态`} value={message.call?.status ?? 'duration'} onChange={event => updateCall({ status: event.target.value as CallRecord['status'] })}>
          <option value="duration">通话时长</option>
          <option value="cancelled">已取消</option>
          <option value="missed">未接听</option>
          <option value="unanswered">对方无应答</option>
        </select>
      </label>
      {(message.call?.status ?? 'duration') === 'duration' ? (
        <div className={styles.durationFields}>
          <label><span>时</span><input type="number" min="0" aria-label={`消息 ${number} 通话小时`} value={Math.floor((message.call?.durationSeconds ?? 0) / 3600)} onChange={event => updateDurationPart('hours', event.target.value)} /></label>
          <label><span>分</span><input type="number" min="0" max="59" aria-label={`消息 ${number} 通话分钟`} value={Math.floor(((message.call?.durationSeconds ?? 0) % 3600) / 60)} onChange={event => updateDurationPart('minutes', event.target.value)} /></label>
          <label><span>秒</span><input type="number" min="0" max="59" aria-label={`消息 ${number} 通话秒`} value={(message.call?.durationSeconds ?? 0) % 60} onChange={event => updateDurationPart('seconds', event.target.value)} /></label>
        </div>
      ) : null}
    </div>
  )
}
