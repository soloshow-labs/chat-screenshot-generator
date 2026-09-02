import type { Dispatch } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { ChatDraft, Message } from '../../app/chatTypes'
import { resolveCaptureRange } from '../../utils/captureRange'
import { messageOptionLabel } from '../../utils/messageSummary'
import { IPHONE_15_PRO_MAX_PRESET, matchesIphone15ProMax } from './outputPreset'
import styles from './SettingsPanel.module.css'

interface CaptureSettingsProps {
  draft: ChatDraft
  messages: Message[]
  dispatch: Dispatch<ChatAction>
  customSizing: boolean
  onCustomSizingChange: (custom: boolean) => void
  onOpenAdvancedOutput: () => void
}

export function CaptureSettings({ draft, messages, dispatch, customSizing, onCustomSizingChange, onOpenAdvancedOutput }: CaptureSettingsProps) {
  const captureRange = resolveCaptureRange(messages, draft.captureStartMessageId, draft.captureEndMessageId)
  const devicePreset = !customSizing && matchesIphone15ProMax(draft) ? IPHONE_15_PRO_MAX_PRESET.id : 'custom'
  const finalWidth = draft.outputWidth * draft.exportScale
  const finalHeight = draft.outputHeight * draft.exportScale
  const selfName = draft.participants.find(participant => participant.isSelf)?.name ?? '当前身份'
  function applyDevicePreset(value: string) {
    if (value === 'custom') {
      onCustomSizingChange(true)
      onOpenAdvancedOutput()
      return
    }
    onCustomSizingChange(false)
    dispatch({ type: 'set-fields', patch: { outputWidth: IPHONE_15_PRO_MAX_PRESET.width, outputHeight: IPHONE_15_PRO_MAX_PRESET.height, exportScale: IPHONE_15_PRO_MAX_PRESET.scale } })
  }

  return (
    <section className={styles.panel} aria-labelledby="capture-settings-title">
      <h2 id="capture-settings-title">截图与导出</h2>
      <div className={styles.fieldGroup}>
        <span className={styles.label}>导出范围</span>
        <div className={styles.segmented}>{(['screen', 'long'] as const).map((outputMode) => (
          <button type="button" key={outputMode} className={draft.outputMode === outputMode ? styles.active : ''}
            aria-pressed={draft.outputMode === outputMode} onClick={() => dispatch({ type: 'set-field', field: 'outputMode', value: outputMode })}>
            {outputMode === 'screen' ? '手机屏幕' : '聊天长图'}
          </button>
        ))}</div>
      </div>
      {draft.outputMode === 'long' ? (
        <div className={styles.inlineFields}>
          <label className={styles.fieldGroup}>
            <span className={styles.label}>开始消息</span>
            <select aria-label="开始消息" value={draft.captureStartMessageId ?? ''}
              onChange={(event) => dispatch({ type: 'set-field', field: 'captureStartMessageId', value: event.target.value || null })}>
              <option value="">第一条消息</option>
              {messages.map((message, index) => <option value={message.id} key={message.id}>{messageOptionLabel(message, index)}</option>)}
            </select>
          </label>
          <label className={styles.fieldGroup}>
            <span className={styles.label}>结束消息</span>
            <select aria-label="结束消息" value={draft.captureEndMessageId ?? ''}
              onChange={(event) => dispatch({ type: 'set-field', field: 'captureEndMessageId', value: event.target.value || null })}>
              <option value="">最后一条消息</option>
              {messages.map((message, index) => <option value={message.id} key={message.id}>{messageOptionLabel(message, index)}</option>)}
            </select>
          </label>
          {!captureRange.valid ? <span className={`${styles.error} ${styles.fullRow}`} role="alert">开始消息必须位于结束消息之前</span> : null}
        </div>
      ) : null}
      <label className={styles.fieldGroup}>
        <span className={styles.label}>设备预设</span>
        <select aria-label="设备预设" value={devicePreset} onChange={(event) => applyDevicePreset(event.target.value)}>
          <option value={IPHONE_15_PRO_MAX_PRESET.id}>iPhone 15 Pro Max</option><option value="custom">自定义尺寸</option>
        </select>
      </label>
      <div className={styles.outputSummary} aria-label="当前导出尺寸"><strong>
        {draft.outputMode === 'screen' ? `${finalWidth} × ${finalHeight} · ${draft.exportScale}×` : `${finalWidth}px 宽 · 高度随内容 · ${draft.exportScale}×`}
      </strong></div>
      <label className={styles.switchRow}><span>显示输入栏</span><input type="checkbox" checked={draft.showInputBar}
        onChange={(event) => dispatch({ type: 'set-field', field: 'showInputBar', value: event.target.checked })} /></label>
      {draft.showInputBar ? (
        <div className={styles.inputBarSettings}>
          <div className={styles.fieldGroup}>
            <span className={styles.label}>输入栏模式</span>
            <div className={styles.segmented}>{(['text', 'voice'] as const).map(mode => (
              <button key={mode} type="button" aria-label={mode === 'text' ? '文字模式' : '语音模式'} aria-pressed={draft.inputBarMode === mode}
                className={draft.inputBarMode === mode ? styles.active : ''} onClick={() => dispatch({ type: 'set-field', field: 'inputBarMode', value: mode })}>
                {mode === 'text' ? '文字' : '语音'}
              </button>
            ))}</div>
          </div>
          <label className={styles.fieldGroup}><span className={styles.label}>输入栏草稿</span><input aria-label="输入栏草稿" value={draft.inputDraft}
            maxLength={2000} onChange={event => dispatch({ type: 'set-field', field: 'inputDraft', value: event.target.value })} /></label>
          <button type="button" className={styles.quickSendButton} aria-label={`按${selfName}发送`} disabled={draft.inputBarMode !== 'text' || !draft.inputDraft.trim()}
            onClick={() => dispatch({ type: 'send-input-draft', messageId: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `message-${Date.now()}`, sentAt: new Date().toISOString() })}>
            按“{selfName}”发送并清空草稿
          </button>
          <span className={styles.hint}>快速发送会新增一条文字消息，并作为一次操作撤销。</span>
        </div>
      ) : null}
      <div className={`${styles.fieldGroup} ${styles.lastField}`}>
        <span className={styles.label}>消息时间</span>
        <div className={styles.segmented}>{(['smart', 'hidden'] as const).map((mode) => (
          <button type="button" key={mode} className={draft.timeDisplayMode === mode ? styles.active : ''}
            aria-pressed={draft.timeDisplayMode === mode} onClick={() => dispatch({ type: 'set-field', field: 'timeDisplayMode', value: mode })}>
            {mode === 'smart' ? '智能显示' : '不显示时间'}
          </button>
        ))}</div>
      </div>
    </section>
  )
}
