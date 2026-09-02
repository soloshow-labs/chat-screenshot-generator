import { useState, type Dispatch } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { ChatDraft, ConversationType } from '../../app/chatTypes'
import { WallpaperFields } from './WallpaperFields'
import styles from './SettingsPanel.module.css'

interface ConversationSettingsProps {
  draft: ChatDraft
  dispatch: Dispatch<ChatAction>
  onRequestConversationTypeChange: (type: ConversationType) => void
}

export function ConversationSettings({ draft, dispatch, onRequestConversationTypeChange }: ConversationSettingsProps) {
  const [groupInput, setGroupInput] = useState({ saved: draft.groupMemberCount, invalid: null as string | null })
  if (groupInput.saved !== draft.groupMemberCount) setGroupInput({ saved: draft.groupMemberCount, invalid: null })

  return (
    <section className={`${styles.panel} ${styles.basicPanel}`} aria-labelledby="conversation-settings-title">
      <h2 id="conversation-settings-title">对话设置</h2>
      <div className={styles.fieldGroup}>
        <span className={styles.label}>对话类型</span>
        <div className={styles.segmented}>
          {(['direct', 'group'] as const).map((type) => (
            <button type="button" key={type} className={draft.conversationType === type ? styles.active : ''}
              aria-pressed={draft.conversationType === type} onClick={() => onRequestConversationTypeChange(type)}>
              {type === 'direct' ? '单聊' : '群聊'}
            </button>
          ))}
        </div>
      </div>
      <label className={styles.fieldGroup}>
        <span className={styles.label}>聊天标题</span>
        <input aria-label="聊天标题" value={draft.title} onChange={(event) => dispatch({ type: 'set-field', field: 'title', value: event.target.value })} />
      </label>
      {draft.conversationType === 'group' ? <>
        <label className={styles.fieldGroup}>
          <span className={styles.label}>群显示人数</span>
          <input aria-label="群显示人数" type="number" min="1" max="99999" step="1" placeholder={`自动（${draft.participants.length} 人）`}
            value={groupInput.invalid ?? draft.groupMemberCount ?? ''} aria-invalid={groupInput.invalid !== null}
            aria-describedby={groupInput.invalid !== null ? 'group-member-count-error' : undefined}
            onChange={event => {
              const raw = event.target.value
              const value = raw === '' ? null : Number(raw)
              if (value !== null && (!Number.isInteger(value) || value < 1 || value > 99999)) {
                setGroupInput({ saved: draft.groupMemberCount, invalid: raw })
                return
              }
              setGroupInput({ saved: value, invalid: null })
              dispatch({ type: 'set-field', field: 'groupMemberCount', value })
            }} />
          {groupInput.invalid !== null ? <span id="group-member-count-error" className={styles.error} role="alert">请输入 1–99999 的整数，留空为自动人数</span> : null}
          <span className={styles.hint}>仅修改标题人数，无需添加所有群成员；留空按已添加成员计数。</span>
        </label>
        <label className={styles.switchRow}>
          <span>显示群成员昵称</span>
          <input type="checkbox" checked={draft.showGroupNicknames !== false} onChange={event => dispatch({ type: 'set-field', field: 'showGroupNicknames', value: event.target.checked })} />
        </label>
      </> : null}
      <div className={`${styles.fieldGroup} ${styles.lastField}`}>
        <span className={styles.label}>主题</span>
        <div className={styles.segmented}>
          {(['light', 'dark'] as const).map((theme) => (
            <button type="button" key={theme} className={draft.theme === theme ? styles.active : ''}
              aria-pressed={draft.theme === theme} onClick={() => dispatch({ type: 'set-field', field: 'theme', value: theme })}>
              {theme === 'light' ? '浅色' : '深色'}
            </button>
          ))}
        </div>
      </div>
      <WallpaperFields wallpaper={draft.wallpaper} dispatch={dispatch} />
    </section>
  )
}
