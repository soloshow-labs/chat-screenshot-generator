import type { Dispatch } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { ChatDraft, ExportScale } from '../../app/chatTypes'
import styles from './SettingsPanel.module.css'

interface AdvancedOutputSettingsProps { draft: ChatDraft; dispatch: Dispatch<ChatAction>; open: boolean; onOpenChange: (open: boolean) => void }

export function AdvancedOutputSettings({ draft, dispatch, open, onOpenChange }: AdvancedOutputSettingsProps) {
  return (
    <details className={styles.accordion} open={open} onToggle={(event) => onOpenChange(event.currentTarget.open)}>
      <summary><span>高级输出设置</span><small>尺寸、倍率与底部细节</small></summary>
      <div className={styles.accordionBody}>
        <div className={styles.inlineFields}>
          <label className={styles.fieldGroup}><span className={styles.label}>输出宽度</span><input aria-label="输出宽度" type="number" min="320" max="1290"
            value={draft.outputWidth} onChange={(event) => dispatch({ type: 'set-field', field: 'outputWidth', value: Math.min(1290, Math.max(320, Math.round(Number(event.target.value)))) })} /></label>
          {draft.outputMode === 'screen' ? <label className={styles.fieldGroup}><span className={styles.label}>输出高度</span><input aria-label="输出高度" type="number"
            min="480" max="3000" value={draft.outputHeight} onChange={(event) => dispatch({ type: 'set-field', field: 'outputHeight', value: Math.min(3000, Math.max(480, Math.round(Number(event.target.value)))) })} /></label> : null}
        </div>
        <label className={styles.fieldGroup}>
          <span className={styles.label}>清晰度倍率</span>
          <select aria-label="清晰度倍率" value={String(draft.exportScale)}
            onChange={(event) => dispatch({ type: 'set-field', field: 'exportScale', value: Number(event.target.value) as ExportScale })}>
            <option value="1">1×</option><option value="2">2×</option><option value="3">3×（推荐）</option><option value="4">4×</option>
          </select>
          <span className={styles.hint}>聊天内容保持 430px 逻辑宽度，调整只影响导出尺寸。</span>
        </label>
        <label className={`${styles.switchRow} ${styles.lastField}`}><span>显示底部横条</span><input type="checkbox" checked={draft.showHomeIndicator}
          onChange={(event) => dispatch({ type: 'set-field', field: 'showHomeIndicator', value: event.target.checked })} /></label>
      </div>
    </details>
  )
}
