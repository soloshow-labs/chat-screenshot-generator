import { useState, type Dispatch } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { ChatDraft, SignalStrength } from '../../app/chatTypes'
import styles from './SettingsPanel.module.css'

interface StatusBarSettingsProps { draft: ChatDraft; dispatch: Dispatch<ChatAction> }
const validStatusTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export function StatusBarSettings({ draft, dispatch }: StatusBarSettingsProps) {
  const [invalidStatusTime, setInvalidStatusTime] = useState<string | null>(null)
  const statusTimeInput = invalidStatusTime ?? draft.statusTime
  function updateStatusTime(value: string) {
    if (validStatusTime.test(value)) {
      setInvalidStatusTime(null)
      dispatch({ type: 'set-field', field: 'statusTime', value })
    } else setInvalidStatusTime(value)
  }
  return (
    <details className={styles.accordion}>
      <summary><span>手机状态栏</span><small>{draft.networkType === 'wifi' ? 'Wi-Fi' : '5G'} · {draft.batteryPercent}%</small></summary>
      <div className={styles.accordionBody}>
        <label className={styles.switchRow}><span>显示状态栏</span><input type="checkbox" checked={draft.showStatusBar}
          onChange={(event) => dispatch({ type: 'set-field', field: 'showStatusBar', value: event.target.checked })} /></label>
        <div className={styles.inlineFields}>
          <label className={styles.fieldGroup}>
            <span className={styles.label}>状态栏时间</span>
            <input aria-label="状态栏时间" value={statusTimeInput} inputMode="numeric" disabled={draft.followSystemTime}
              aria-invalid={!validStatusTime.test(statusTimeInput)} aria-describedby={!validStatusTime.test(statusTimeInput) ? 'status-time-error' : undefined}
              onChange={(event) => updateStatusTime(event.target.value)} />
            {!validStatusTime.test(statusTimeInput) ? <span id="status-time-error" className={styles.error} role="alert">请输入 00:00–23:59</span> : null}
          </label>
          <label className={styles.fieldGroup}>
            <span className={styles.label}>电量</span>
            <div className={styles.batteryInput}><input aria-label="电量" type="number" min="0" max="100" value={draft.batteryPercent}
              onChange={(event) => dispatch({ type: 'set-field', field: 'batteryPercent', value: Math.min(100, Math.max(0, Number(event.target.value))) })} /><span>%</span></div>
          </label>
        </div>
        <label className={styles.switchRow}><span>跟随系统时间</span><input aria-label="跟随系统时间" type="checkbox" checked={draft.followSystemTime}
          onChange={(event) => dispatch({ type: 'set-field', field: 'followSystemTime', value: event.target.checked })} /></label>
        <div className={styles.fieldGroup}>
          <span className={styles.label}>网络标识</span>
          <div className={styles.segmented}>{(['wifi', '5g'] as const).map((networkType) => (
            <button type="button" key={networkType} className={draft.networkType === networkType ? styles.active : ''}
              aria-pressed={draft.networkType === networkType} onClick={() => dispatch({ type: 'set-field', field: 'networkType', value: networkType })}>
              {networkType === 'wifi' ? 'Wi-Fi' : '5G'}
            </button>
          ))}</div>
        </div>
        <div className={styles.fieldGroup}>
          <span className={styles.label}>信号强度</span>
          <div className={`${styles.segmented} ${styles.segmentedFour}`}>{([1, 2, 3, 4] as SignalStrength[]).map((strength) => (
            <button type="button" key={strength} className={draft.signalStrength === strength ? styles.active : ''}
              aria-label={`${strength} 格信号`} aria-pressed={draft.signalStrength === strength}
              onClick={() => dispatch({ type: 'set-field', field: 'signalStrength', value: strength })}>{strength}</button>
          ))}</div>
        </div>
        <label className={styles.switchRow}><span>显示静音铃铛</span><input type="checkbox" checked={draft.showSilentIcon}
          onChange={(event) => dispatch({ type: 'set-field', field: 'showSilentIcon', value: event.target.checked })} /></label>
        <label className={styles.switchRow}><span>显示充电状态</span><input aria-label="显示充电状态" type="checkbox" checked={draft.batteryCharging}
          onChange={(event) => dispatch({ type: 'set-field', field: 'batteryCharging', value: event.target.checked })} /></label>
        <label className={styles.switchRow}><span>显示勿扰状态</span><input aria-label="显示勿扰状态" type="checkbox" checked={draft.showDoNotDisturb}
          onChange={(event) => dispatch({ type: 'set-field', field: 'showDoNotDisturb', value: event.target.checked })} /></label>
        <label className={styles.switchRow}><span>显示听筒模式提示</span><input aria-label="显示听筒模式提示" type="checkbox" checked={draft.earpieceMode}
          onChange={(event) => dispatch({ type: 'set-field', field: 'earpieceMode', value: event.target.checked })} /></label>
        <label className={`${styles.fieldGroup} ${styles.lastField}`}><span className={styles.label}>聊天未读数</span><input aria-label="聊天未读数" type="number" min="0" max="999" value={draft.chatUnreadCount}
          onChange={(event) => dispatch({ type: 'set-field', field: 'chatUnreadCount', value: Math.min(999, Math.max(0, Math.round(Number(event.target.value) || 0))) })} /></label>
      </div>
    </details>
  )
}
