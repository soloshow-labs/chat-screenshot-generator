import { useId, useState, type Dispatch } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { Message, VoicePayload } from '../../app/chatTypes'
import { getVoiceDuration } from '../../utils/voiceMessage'
import styles from './EverydayFields.module.css'

export function VoiceFields({ message, number, dispatch }: { message: Message; number: number; dispatch: Dispatch<ChatAction> }) {
  const voice = message.voice ?? { durationMode: 'auto', durationSeconds: 5, transcript: '', showTranscript: false }
  const [invalidValue, setInvalidValue] = useState<string | null>(null)
  const valueKey = `${voice.durationMode}:${voice.durationSeconds}`
  const [previousValue, setPreviousValue] = useState(valueKey)
  if (previousValue !== valueKey) {
    setPreviousValue(valueKey)
    setInvalidValue(null)
  }
  const errorId = useId()
  function update(patch: Partial<VoicePayload>, separateHistory = false) {
    dispatch({ type: 'update-message', messageId: message.id, patch: { voice: { ...voice, ...patch } }, ...(separateHistory ? { separateHistory: true } : {}) })
  }
  return <div className={styles.voiceFields}>
    <div className={styles.voiceDuration}>
      <label className={styles.field}><span>时长显示</span><select aria-label={`消息 ${number} 时长模式`} value={voice.durationMode} onChange={event => {
        setInvalidValue(null)
        update({ durationMode: event.target.value as VoicePayload['durationMode'] }, true)
      }}>
        <option value="manual">手填秒数</option><option value="auto">使用音频时长</option>
      </select></label>
      {voice.durationMode === 'manual' ? <label className={styles.field}><span>显示秒数（1–60）</span><input type="number" min="1" max="60" step="1" aria-label={`消息 ${number} 显示秒数`} aria-invalid={invalidValue !== null} aria-describedby={invalidValue !== null ? errorId : undefined} value={invalidValue ?? voice.durationSeconds} onChange={event => {
        const raw = event.target.value
        const value = Number(raw)
        if (!raw.trim() || !Number.isInteger(value) || value < 1 || value > 60) { setInvalidValue(raw); return }
        setInvalidValue(null)
        update({ durationSeconds: value })
      }} /></label> : <p className={styles.hint}>{message.media ? `音频显示 ${getVoiceDuration(message)} 秒` : '尚无音频：请上传语音或改用手填秒数。'}</p>}
    </div>
    {invalidValue !== null ? <p id={errorId} className={styles.error} role="alert">请输入 1–60 的整数秒数；草稿保留上次有效值。</p> : null}
    <label className={styles.toggle}><input type="checkbox" aria-label={`消息 ${number} 显示转文字`} checked={voice.showTranscript} onChange={event => update({ showTranscript: event.target.checked }, true)} />显示转文字</label>
    <label className={styles.field}><span>手填转文字</span><textarea rows={2} aria-label={`消息 ${number} 手填转文字`} placeholder="自行填写，不会自动识别音频；可使用 [微笑] 等表情标记" value={voice.transcript} onChange={event => update({ transcript: event.target.value })} /></label>
    <p className={styles.hint}>只改变截图中的显示时长，不会裁剪或修改音频。隐藏转文字不会删除内容。</p>
  </div>
}
